import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { load, type Store } from '@tauri-apps/plugin-store';
import { ArrowLeft, Check, ChevronDown, CircleHelp, Copy, Minus, Plus, RotateCcw, Save, Settings2, Trash2, X } from 'lucide-react';
import { focusAppWindow, focusBrowserTab, getMatchingTabs, getPairingKey, getProfiles, setBrowserProfiles, hideWheel, launch, startHubDrag, listAppWindows, openFolder, openNewBrowserTab, toggleWheel, type AppWindow, type BrowserTab, type ContextAdd, takeStartupContext, windowsContextMenuEnabled, setWindowsContextMenu } from './bridge';
import { icons } from './icons';
import { createStarterEntries, selectInitialSettings } from './starterSettings.mjs';
import { addBrowserProfile, assignProfile, BROWSER_OPTIONS, deleteBrowserProfile, normalizeBrowserSettings, profileForEntry, renameBrowserProfile } from './browserProfiles.mjs';
import BrowserProfilesPanel from './BrowserProfilesPanel';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, WHEEL_FONTS, normalizeAppearance, wheelFontStack, type BrowserId, type Entry, type Settings, type WheelAppearance, type WheelFont, validateEntry } from './types';
import RadialWheel, { type WheelContextAction, type WheelOption } from './RadialWheel';
import WheelItemDialog, { type WheelEditMode } from './WheelItemDialog';
import { editWheelEntry, duplicateWheelEntry, deleteWheelEntry } from './wheelContextActions.mjs';
import { filterByTitle } from './titleFilter.mjs';
import { SETTINGS_CATEGORIES, settingsCategoryTitle, type SettingsCategory } from './settingsCategories';
import { ColorPicker, IconPicker } from './ShortcutAppearancePicker';
import { eligibleParentGroups, flattenHierarchy, getChildren, removeGroup, suggestParent, validateHierarchy } from './groupHierarchy.mjs';
import { dropEntry, type DropMode } from './groupDragDrop.mjs';
import type { CSSProperties } from 'react';

type WheelLevel =
  | { kind: 'settings'; entry: Entry }
  | { kind: 'group'; entry: Entry }
  | { kind: 'tabs'; entry: Entry; tabs: BrowserTab[] }
  | { kind: 'apps'; entry: Entry; windows: AppWindow[] };

const MAX_ITEMS_PER_WHEEL = 10;
/** Synthetic entry to reuse Back and nested-wheel rendering without saving a settings shortcut. */
const SETTINGS_ENTRY: Entry = { id: 'kreis-settings', title: 'Settings', type: 'group', target: '', profile: 'Work', match: 'prefix', icon: 'settings', color: '#617cae' };
const DEFAULT_FOLDER: Entry = { id: '', title: '', type: 'folder', target: 'shell:Downloads', profile: 'Work', match: 'prefix', icon: 'folder', color: '#c1a062' };
const DEFAULT_GROUP: Entry = { id: '', title: '', type: 'group', target: '', profile: 'Work', match: 'prefix', icon: 'folder', color: '#6a8ec2' };
const DEFAULT_NEW: Entry = { id: '', title: '', type: 'browser', target: 'https://', profile: 'Work', match: 'prefix', icon: 'globe', color: '#6385d7' };
const wheelSize = 600;
const tabsPerPage = 7; // Keep the eighth slot for an explicit New Tab action.
const settingsSizes: Record<SettingsCategory, LogicalSize> = {
  hotkey: new LogicalSize(740, 390),
  typography: new LogicalSize(790, 485),
  shortcuts: new LogicalSize(900, 710),
  connection: new LogicalSize(850, 700),
  integrations: new LogicalSize(770, 455)
};
const window = getCurrentWindow();

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [appearanceDraft, setAppearanceDraft] = useState<WheelAppearance>(DEFAULT_APPEARANCE);
  const [screen, setScreen] = useState<'wheel' | 'settings' | 'context'>('wheel');
  const [settingsSection, setSettingsSection] = useState<SettingsCategory>('hotkey');
  const previousWheelPosition = useRef<Awaited<ReturnType<typeof window.outerPosition>> | null>(null);
  const [isReady, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pairingKey, setPairingKey] = useState('');
  const [profiles, setProfiles] = useState<string[]>([]);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [shortcutDraft, setShortcutDraft] = useState('Control+Space');
  const activeShortcut = useRef<string | null>(null);
  const store = useRef<Store | null>(null);
  const [levels, setLevels] = useState<WheelLevel[]>([]);
  const [tabPage, setTabPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const selectionGeneration = useRef(0);
  const [wheelEpoch, setWheelEpoch] = useState(0);
  const [pendingGroup, setPendingGroup] = useState<{ sourceId: string; targetId: string; sourceTitle: string; targetTitle: string; name: string } | null>(null);
  const [wheelFeedback, setWheelFeedback] = useState('');
  const [undoEntries, setUndoEntries] = useState<Entry[] | null>(null);
  const [wheelEdit, setWheelEdit] = useState<{ entryId: string; mode: WheelEditMode } | null>(null);
  const [contextAdd, setContextAdd] = useState<ContextAdd | null>(null);
  const [contextLabel, setContextLabel] = useState('');
  const [contextGroupId, setContextGroupId] = useState('');
  const [contextProfile, setContextProfile] = useState<string>('Work');
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false);
  const latestSettings = useRef(settings);
  latestSettings.current = settings;

  function openContextPicker(entry: ContextAdd) {
    if (!['browser', 'folder', 'app'].includes(entry.kind) || !entry.target) return;
    setContextAdd(entry);
    setContextLabel(entry.title.slice(0, 30) || 'New shortcut');
    setContextGroupId(suggestParent(latestSettings.current.entries, MAX_ITEMS_PER_WHEEL) || '');
    const configured = latestSettings.current.browserProfiles;
    setContextProfile(configured.some(profile => profile.id === entry.profile)
      ? entry.profile! : (configured[0]?.id || ''));
    setError('');
    setNotice('');
    setScreen('context');
  }


  const resetWheel = useCallback(() => {
    selectionGeneration.current++;
    setWheelEpoch(current => current + 1);
    busyRef.current = false;
    setBusy(false);
    setLevels([]);
    setTabPage(0);
    setError('');
    setPendingGroup(null);
    setWheelEdit(null);
    setWheelFeedback('');
    setUndoEntries(null);
  }, []);

  async function closeLauncher() {
    setContextAdd(null);
    resetWheel();
    await hideWheel();
  }


  const registerShortcut = useCallback(async (shortcut: string) => {
    const previous = activeShortcut.current;
    if (shortcut === previous) return shortcut;
    if (previous) await unregister(previous);
    try {
      await register(shortcut, event => {
        if (event.state === 'Pressed') void (async () => { resetWheel(); setScreen('wheel'); await window.setSize(new LogicalSize(wheelSize, wheelSize)); await toggleWheel(); })();
      });
      activeShortcut.current = shortcut;
      return shortcut;
    } catch (cause) {
      if (previous) {
        try { await register(previous, event => { if (event.state === 'Pressed') void (async () => { setScreen('wheel'); await window.setSize(new LogicalSize(wheelSize, wheelSize)); await toggleWheel(); })(); }); activeShortcut.current = previous; }
        catch { activeShortcut.current = null; }
      }
      throw new Error(`Unable to register ${shortcut}. Another program may be using it. ${String(cause)}`);
    }
  }, [resetWheel]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const loaded = await load('kreis.json', { autoSave: false });
        const saved = await loaded.get<Settings>('settings');
        const { settings: initial, isFirstRun } = selectInitialSettings(saved, DEFAULT_SETTINGS, normalizeAppearance);
        const next = normalizeBrowserSettings(initial);
        if (disposed) return;
        store.current = loaded;
        // Persist first-run data immediately so later updates never replace an
        // untouched starter layout. An explicit saved empty array stays empty.
        if (isFirstRun || JSON.stringify(next) !== JSON.stringify(initial)) {
          await loaded.set('settings', next);
          await loaded.save();
        }
        await setBrowserProfiles(next.browserProfiles);
        latestSettings.current = next;
        setSettings(next);
        setAppearanceDraft(next.appearance);
        setShortcutDraft(next.shortcut);
        try { await registerShortcut(next.shortcut); }
        catch {
          const fallback = 'Control+Alt+Space';
          await registerShortcut(fallback);
          const fallbackSettings = { ...next, shortcut: fallback };
          await loaded.set('settings', fallbackSettings);
          await loaded.save();
          setSettings(fallbackSettings);
          setShortcutDraft(fallback);
          setNotice('Ctrl + Space is unavailable. Using Ctrl + Alt + Space instead.');
        }
        setReady(true);
        const unlistenSettings = await listen('show-settings', () => { openSettingsWheel(true); });
        const unlistenWheel = await listen('kreis-wheel-opened', () => {
          resetWheel();
          setScreen('wheel');
        });
        const unlistenContext = await listen<ContextAdd>('kreis-context-add', event => {
          openContextPicker(event.payload);
        });
        const fn = () => { unlistenSettings(); unlistenWheel(); unlistenContext(); };
        if (disposed) { fn(); return; }
        unlisten = fn;
        const incoming = await takeStartupContext();
        if (!disposed && incoming) {
          openContextPicker(incoming);
          await window.setSize(new LogicalSize(600, 600));
          await window.center();
          await window.show();
          await window.setFocus();
        }
      } catch (cause) { setError(String(cause)); }
    })();
    return () => {
      disposed = true;
      unlisten?.();
      if (activeShortcut.current) void unregister(activeShortcut.current);
    };
  // Avoid re-running initialization while settings change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveContextAddition() {
    if (!contextAdd || busyRef.current) return;
    const entry: Entry = {
      id: crypto.randomUUID(),
      title: contextLabel.trim(),
      type: contextAdd.kind,
      target: contextAdd.target,
      profile: contextProfile,
      ...(contextAdd.kind === 'browser' ? {
        profileId: contextProfile,
        browserId: settings.browserProfiles.find(profile => profile.id === contextProfile)?.browserId
      } : {}),
      match: contextAdd.kind === 'browser' ? 'exact' : 'prefix',
      icon: contextAdd.kind === 'folder' ? 'folder' : contextAdd.kind === 'app' ? 'rocket' : 'globe',
      color: contextAdd.kind === 'folder' ? '#c1a062' : contextAdd.kind === 'app' ? '#438ba8' : '#6385d7',
      groupId: contextGroupId || undefined
    };
    const validation = validateEntry(entry);
    if (validation) return setError(validation);
    const entries = [...settings.entries, entry];
    const hierarchyError = validateHierarchy(entries, MAX_ITEMS_PER_WHEEL, settings.entries);
    if (hierarchyError) return setError(hierarchyError);
    busyRef.current = true;
    setBusy(true);
    try {
      await persist({ ...settings, entries });
      await closeLauncher();
    } catch (cause) { setError(String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function toggleContextMenuIntegration() {
    setError('');
    try {
      const enabled = !contextMenuEnabled;
      await setWindowsContextMenu(enabled);
      setContextMenuEnabled(await windowsContextMenuEnabled());
      setNotice(enabled ? 'Added Explorer context menus.' : 'Removed Explorer context menus.');
    } catch (cause) { setError(String(cause)); }
  }

  async function persist(next: Settings) {
    if (!store.current) throw new Error('Settings storage is not ready.');
    await setBrowserProfiles(next.browserProfiles);
    await store.current.set('settings', next);
    await store.current.save();
    setSettings(next);
  }

  async function createBrowserProfile(name: string, browserId: BrowserId) {
    const result = addBrowserProfile(settings.browserProfiles, name, browserId, crypto.randomUUID());
    if (result.error || !result.profiles) { setError(result.error || 'Could not add profile.'); return; }
    try {
      await persist({ ...settings, browserProfiles: result.profiles });
      setError('');
      setNotice('Browser profile added. Pair its extension using the key below.');
    } catch (cause) { setError(String(cause)); }
  }

  async function changeBrowserProfileName(profileId: string, name: string) {
    const result = renameBrowserProfile(settings.browserProfiles, profileId, name);
    if (result.error || !result.profiles) { setError(result.error || 'Could not rename profile.'); return; }
    try {
      await persist({ ...settings, browserProfiles: result.profiles });
      setError('');
      setNotice('Profile renamed. Shortcut assignments have not changed.');
    } catch (cause) { setError(String(cause)); }
  }

  async function removeBrowserProfile(profileId: string, replacementId: string) {
    const result = deleteBrowserProfile(settings, profileId, replacementId);
    if (result.error || !result.settings) { setError(result.error || 'Could not remove profile.'); return; }
    try {
      await persist(result.settings);
      setProfiles(await getProfiles());
      setError('');
      setNotice(replacementId ? 'Profile removed and shortcuts reassigned.' :
        'Profile removed. Its shortcuts remain saved but need another profile.');
    } catch (cause) { setError(String(cause)); }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (draft) { setDraft(null); return; }
        if (wheelEdit) { setWheelEdit(null); setError(''); return; }
        if (screen === 'context') { void closeLauncher(); return; }
        if (pendingGroup) { setPendingGroup(null); return; }
        if (screen === 'settings') { void backToSettingsWheel(); return; }
        void closeLauncher();
      } else if (event.key === 'Backspace' && !pendingGroup && screen === 'wheel' && levels.length > 0) {
        event.preventDefault();
        backOneLevel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [draft, wheelEdit, pendingGroup, screen, levels]);

  /** The main wheel's center and the tray Settings item both open the category wheel. */
  function openSettingsWheel(fromTray = false) {
    setScreen('wheel');
    setError('');
    setNotice('');
    setTabPage(0);
    if (fromTray) {
      resetWheel();
      setLevels([{ kind: 'settings', entry: SETTINGS_ENTRY }]);
    } else {
      pushLevel({ kind: 'settings', entry: SETTINGS_ENTRY });
    }
  }

  async function openSettings(section: SettingsCategory) {
    setSettingsSection(section);
    setDraft(null);
    setError('');
    setNotice('');
    // Unsaved edits in one category never silently carry into a later visit.
    setAppearanceDraft(settings.appearance);
    setShortcutDraft(settings.shortcut);
    try {
      previousWheelPosition.current = await window.outerPosition();
      setScreen('settings');
      await window.setSize(settingsSizes[section]);
      await window.center();
      await window.show();
      await window.setFocus();
      if (section === 'connection') {
        const [key, connected] = await Promise.all([getPairingKey(), getProfiles()]);
        setPairingKey(key);
        setProfiles(connected);
      }
      if (section === 'integrations') {
        setContextMenuEnabled(await windowsContextMenuEnabled());
      }
    } catch (cause) { setError(String(cause)); }
  }

  /** Return to the same nested settings wheel, at its original cursor location. */
  async function backToSettingsWheel() {
    setDraft(null);
    setError('');
    setNotice('');
    setScreen('wheel');
    try {
      await window.setSize(new LogicalSize(wheelSize, wheelSize));
      if (previousWheelPosition.current) {
        await window.setPosition(previousWheelPosition.current);
      }
      await window.show();
      await window.setFocus();
    } catch (cause) { setError(String(cause)); }
  }

  async function closeSettings() {
    resetWheel();
    setDraft(null);
    setScreen('wheel');
    await window.setSize(new LogicalSize(wheelSize, wheelSize));
    await hideWheel();
  }

  function backOneLevel() {
    setLevels(current => current.slice(0, -1));
    setTabPage(0);
    setError('');
  }

  function pushLevel(level: WheelLevel) {
    setLevels(current => [...current, level]);
    setTabPage(0);
    setError('');
  }

  async function selectEntry(entry: Entry) {
    if (busyRef.current) return;
    if (entry.type === 'group') {
      pushLevel({ kind: 'group', entry });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = selectionGeneration.current;
    try {
      if (entry.type === 'browser') {
        const configuredProfile = profileForEntry(entry, settings.browserProfiles);
        if (!configuredProfile) {
          throw new Error(`The shortcut "${entry.title}" has no assigned browser profile. Edit it in Settings → Shortcuts & Groups.`);
        }
        const matchingUrlTabs = await getMatchingTabs(entry);
        if (generation !== selectionGeneration.current) return;
        const titleContains = entry.windowTitle?.trim() || '';
        // Never fall back to an unfiltered activation when the title filter
        // requires the extension. That could switch to an unrelated chat.
        if (titleContains && matchingUrlTabs === null) {
          throw new Error(`The ${configuredProfile.browserId} · ${configuredProfile.name} extension did not respond. Title filtering requires the paired browser profile.`);
        }
        const tabs = matchingUrlTabs ? filterByTitle(matchingUrlTabs, titleContains) : null;
        if (titleContains && tabs?.length === 0) {
          throw new Error(`No open ${configuredProfile.name} tab matching ${entry.title} has "${titleContains}" in its title.`);
        }
        if (tabs && tabs.length > 1) {
          pushLevel({ kind: 'tabs', entry, tabs });
          return;
        }
        if (tabs && tabs.length === 1) {
          await focusBrowserTab(entry.profileId ?? entry.profile, tabs[0].id);
        } else {
          // For unfiltered links, retain the existing new-tab/default-browser fallback.
          const result = await launch(entry);
          if (result.details) setNotice(result.details);
        }
      } else if (entry.type === 'folder') {
        await openFolder(entry.target);
        // The native command hides Kreis before sending Explorer keyboard
        // shortcuts; keeping this branch separate avoids browser fallback.
      } else if (entry.type === 'app') {
        const availableWindows = await listAppWindows(entry.target);
        if (generation !== selectionGeneration.current) return;
        const titleFilter = entry.windowTitle?.trim().toLocaleLowerCase() || '';
        const windows = titleFilter
          ? availableWindows.filter(appWindow => appWindow.title.toLocaleLowerCase().includes(titleFilter))
          : availableWindows;
        if (titleFilter && windows.length === 0) {
          throw new Error(`No ${entry.title} window matching "${entry.windowTitle}" is open.`);
        }
        if (windows.length > 1) {
          pushLevel({ kind: 'apps', entry, windows });
          return;
        }
        if (windows.length === 1) {
          await focusAppWindow(entry.target, windows[0].id);
        } else {
          await launch(entry);
        }
      }
      if (generation === selectionGeneration.current) await closeLauncher();
    } catch (cause) {
      if (generation === selectionGeneration.current) setError(String(cause));
    } finally {
      if (generation === selectionGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function selectTab(tab: BrowserTab, entry: Entry) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = selectionGeneration.current;
    try {
      await focusBrowserTab(entry.profileId ?? entry.profile, tab.id);
      if (generation === selectionGeneration.current) await closeLauncher();
    } catch (cause) {
      if (generation === selectionGeneration.current) setError(String(cause));
    } finally {
      if (generation === selectionGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function selectAppWindow(appWindow: AppWindow, entry: Entry) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = selectionGeneration.current;
    try {
      await focusAppWindow(entry.target, appWindow.id);
      if (generation === selectionGeneration.current) await closeLauncher();
    } catch (cause) {
      if (generation === selectionGeneration.current) setError(String(cause));
    } finally {
      if (generation === selectionGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function openNewTab(entry: Entry) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = selectionGeneration.current;
    try {
      await openNewBrowserTab(entry);
      if (generation === selectionGeneration.current) await closeLauncher();
    } catch (cause) {
      if (generation === selectionGeneration.current) setError(String(cause));
    } finally {
      if (generation === selectionGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function saveAppearance() {
    setError('');
    try {
      const appearance = normalizeAppearance(appearanceDraft);
      await persist({ ...settings, appearance });
      setAppearanceDraft(appearance);
      setNotice('Wheel typography saved.');
    } catch (cause) { setError(String(cause)); }
  }

  async function saveShortcut() {
    setError('');
    const nextShortcut = shortcutDraft.trim();
    if (!nextShortcut) return setError('Enter a shortcut. Example: Control+Space');
    try {
      await registerShortcut(nextShortcut);
      await persist({ ...settings, shortcut: nextShortcut });
      setNotice(`Shortcut updated to ${nextShortcut}.`);
    } catch (cause) { setError(String(cause)); }
  }

  function childrenFor(groupId: string) {
    return getChildren(settings.entries, groupId);
  }

  async function saveEntry() {
    if (!draft) return;
    const problem = validateEntry(draft);
    if (problem) return setError(problem);
    if (draft.type === 'browser' && !profileForEntry(draft, settings.browserProfiles)) {
      return setError('Select a configured browser profile. You can add one under Settings → Connection.');
    }
    const entry: Entry = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim(),
      target: draft.type === 'group' ? '' : draft.target.trim(),
      // Groups and shortcuts share the same parent ID for unlimited sub-Kreise.
      groupId: draft.groupId || undefined,
      windowTitle: draft.type === 'app' || draft.type === 'browser'
        ? draft.windowTitle?.trim() || undefined : undefined
    };
    const entries = draft.id
      ? settings.entries.map(current => current.id === draft.id ? entry : current)
      : [...settings.entries, entry];
    const hierarchyError = validateHierarchy(entries, MAX_ITEMS_PER_WHEEL, settings.entries);
    if (hierarchyError) return setError(hierarchyError);
    try { await persist({ ...settings, entries }); setDraft(null); setError(''); }
    catch (cause) { setError(String(cause)); }
  }

  async function deleteEntry(id: string) {
    const result = removeGroup(settings.entries, id, MAX_ITEMS_PER_WHEEL);
    if (result.error) return setError(result.error);
    try { await persist({ ...settings, entries: result.entries }); setError(''); }
    catch (cause) { setError(String(cause)); }
  }


  /** All direct wheel changes are persisted with the same validation as Settings. */
  async function applyWheelContextEntries(nextEntries: Entry[], message: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const previous = settings.entries;
    try {
      await persist({ ...settings, entries: nextEntries });
      setUndoEntries(previous);
      setWheelFeedback(message);
      setWheelEdit(null);
    } catch (cause) { setError(String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function handleWheelContextAction(entryId: string, action: WheelContextAction) {
    if (busyRef.current || pendingGroup) return;
    const entry = settings.entries.find(item => item.id === entryId);
    if (!entry) return setError('Shortcut no longer exists.');
    setError('');
    setWheelFeedback('');
    if (action === 'copy') {
      void navigator.clipboard.writeText(entry.target)
        .then(() => setWheelFeedback('Target copied to clipboard'))
        .catch(cause => setError(`Could not copy shortcut: ${String(cause)}`));
      return;
    }
    if (action === 'duplicate') {
      const result = duplicateWheelEntry(settings.entries, entryId, crypto.randomUUID(), MAX_ITEMS_PER_WHEEL);
      if (result.error) return setError(result.error);
      void applyWheelContextEntries(result.entries, `Duplicated ${entry.title}`);
      return;
    }
    setWheelEdit({ entryId, mode: action });
  }

  function saveWheelItem(edited: Entry) {
    const entry: Entry = {
      ...edited,
      title: edited.title.trim(),
      target: edited.type === 'group' ? '' : edited.target.trim(),
      groupId: edited.groupId || undefined,
      windowTitle: edited.windowTitle?.trim() || undefined
    };
    const invalid = validateEntry(entry);
    if (invalid) return setError(invalid);
    const result = editWheelEntry(settings.entries, entry, MAX_ITEMS_PER_WHEEL);
    if (result.error) return setError(result.error);
    void applyWheelContextEntries(result.entries, `Updated ${entry.title}`);
  }

  function deleteWheelItem(id: string) {
    const entry = settings.entries.find(item => item.id === id);
    if (!entry) return setError('Shortcut no longer exists.');
    const result = deleteWheelEntry(settings.entries, id, MAX_ITEMS_PER_WHEEL);
    if (result.error) return setError(result.error);
    void applyWheelContextEntries(result.entries, `Removed ${entry.title}`);
  }

  /** Start the drag in Rust; movement uses one physical Windows coordinate system.
   * The Tauri window should stay focused and visible until the button is released.
   */
  async function moveKreisByHub() {
    try {
      await startHubDrag();
    } catch (cause) {
      setError(`Could not move Kreis: ${String(cause)}`);
    }
  }

  /** Drag/drop happens directly on the radial launcher. Settings arrows remain. */
  async function persistWheelDrop(sourceId: string, targetId: string | null, mode: DropMode,
    group?: { id: string; title: string }) {
    if (busyRef.current) return;
    const source = settings.entries.find(entry => entry.id === sourceId);
    const target = targetId ? settings.entries.find(entry => entry.id === targetId) : undefined;
    if (!source) return setError('Shortcut no longer exists.');
    const parentGroupId = activeLevel?.kind === 'group' ? activeLevel.entry.groupId : undefined;
    const result = dropEntry(settings.entries, sourceId, targetId, mode, {
      groupId: group?.id, groupTitle: group?.title, parentGroupId,
      limit: MAX_ITEMS_PER_WHEEL
    });
    if (result.error) return setError(result.error);
    if (!result.changed) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setWheelFeedback('');
    try {
      await persist({ ...settings, entries: result.entries });
      setUndoEntries(settings.entries);
      setWheelFeedback(mode === 'combine' ? `Created ${group?.title}`
        : mode === 'inside' ? `Moved ${source.title} into ${target?.title}`
        : mode === 'root' ? `Moved ${source.title} up a level`
        : `Reordered ${source.title}`);
      setPendingGroup(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function dropWheelWedge(sourceId: string, targetId: string | null, mode: DropMode) {
    if (busyRef.current || pendingGroup) return;
    if (mode === 'combine') {
      const source = settings.entries.find(entry => entry.id === sourceId);
      const target = settings.entries.find(entry => entry.id === targetId);
      if (!source || !target) return;
      setError('');
      setPendingGroup({
        sourceId, targetId: target.id,
        sourceTitle: source.title, targetTitle: target.title,
        name: `${target.title} + ${source.title}`.slice(0, 30)
      });
      return;
    }
    void persistWheelDrop(sourceId, targetId, mode);
  }

  async function confirmWheelGroup() {
    if (!pendingGroup || !pendingGroup.name.trim()) return;
    await persistWheelDrop(pendingGroup.sourceId, pendingGroup.targetId, 'combine', {
      id: crypto.randomUUID(), title: pendingGroup.name.trim()
    });
  }

  async function undoWheelDrop() {
    if (!undoEntries || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await persist({ ...settings, entries: undoEntries });
      setUndoEntries(null);
      setWheelFeedback('Arrangement restored');
    } catch (cause) {
      setError(String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function moveEntry(id: string, delta: number) {
    const item = settings.entries.find(entry => entry.id === id);
    if (!item) return;
    const siblings = settings.entries.filter(entry => (entry.groupId || '') === (item.groupId || ''));
    const index = siblings.findIndex(entry => entry.id === id);
    const next = siblings[index + delta];
    if (!next) return;
    const entries = [...settings.entries];
    const from = entries.findIndex(entry => entry.id === id);
    const to = entries.findIndex(entry => entry.id === next.id);
    [entries[from], entries[to]] = [entries[to], entries[from]];
    try { await persist({ ...settings, entries }); setError(''); }
    catch (cause) { setError(String(cause)); }
  }

  const rootEntries = getChildren(settings.entries);
  const arrangedEntries = flattenHierarchy(settings.entries);
  const defaultNewParent = suggestParent(settings.entries, MAX_ITEMS_PER_WHEEL);
  const canAddToAnyWheel = rootEntries.length < MAX_ITEMS_PER_WHEEL || defaultNewParent !== undefined;
  const activeLevel = levels[levels.length - 1];
  const editedWheelEntry = wheelEdit
    ? settings.entries.find(item => item.id === wheelEdit.entryId) : undefined;
  const currentOptions = activeLevel?.kind === 'group'
    ? childrenFor(activeLevel.entry.id) : rootEntries;

  const pageCount = activeLevel?.kind === 'tabs'
    ? Math.ceil(activeLevel.tabs.length / tabsPerPage)
    : activeLevel?.kind === 'apps'
      ? Math.ceil(activeLevel.windows.length / 8) : 1;
  const wheelButtons: WheelOption[] =
    activeLevel?.kind === 'settings'
      ? SETTINGS_CATEGORIES.map(category => ({
          key: category.key,
          title: category.title,
          icon: category.icon,
          color: category.color,
          tooltip: category.description,
          onSelect: () => void openSettings(category.key)
        }))
    : activeLevel?.kind === 'tabs'
      ? [
          ...activeLevel.tabs.slice(tabPage * tabsPerPage, (tabPage + 1) * tabsPerPage)
            .map(tab => ({
              key: `tab-${tab.id}`, title: tab.title || 'Untitled tab',
              color: activeLevel.entry.color, icon: activeLevel.entry.icon,
              tooltip: tab.title || 'Untitled tab',
              onSelect: () => void selectTab(tab, activeLevel.entry)
            })),
          {
            key: 'new-tab', title: 'New tab', color: '#3b846d',
            icon: 'plus', isNew: true,
            tooltip: `Open a new ${activeLevel.entry.title} tab`,
            onSelect: () => void openNewTab(activeLevel.entry)
          }
        ]
      : activeLevel?.kind === 'apps'
        ? activeLevel.windows.slice(tabPage * 8, (tabPage + 1) * 8)
          .map(appWindow => ({
            key: `window-${appWindow.id}`, title: appWindow.title,
            color: activeLevel.entry.color, icon: activeLevel.entry.icon,
            tooltip: appWindow.title,
            onSelect: () => void selectAppWindow(appWindow, activeLevel.entry)
          }))
        : currentOptions.map(entry => ({
            key: entry.id, title: entry.title, color: entry.color, icon: entry.icon,
            isGroup: entry.type === 'group',
            tooltip: entry.type === 'group' ? `Open ${entry.title} group`
              : `${entry.title} (${entry.type === 'browser' ? (profileForEntry(entry, settings.browserProfiles)?.name || 'Unassigned profile') : entry.type === 'folder' ? 'File Explorer' : 'Windows'})`,
            onSelect: () => void selectEntry(entry)
          }));

  const levelCount = activeLevel?.kind === 'settings' ? SETTINGS_CATEGORIES.length
    : activeLevel?.kind === 'group'
    ? currentOptions.length
    : activeLevel?.kind === 'tabs' ? activeLevel.tabs.length
      : activeLevel?.kind === 'apps' ? activeLevel.windows.length : 0;
  const levelCountLabel = activeLevel?.kind === 'settings' ? 'categories'
    : activeLevel?.kind === 'group' ? 'shortcuts'
    : activeLevel?.kind === 'apps' ? 'windows' : 'tabs';

  return (
    <main className={screen === 'wheel' ? 'wheel-screen' : 'settings-screen'}>
      {screen === 'context' && contextAdd ? (
        <div className="quick-add-shell">
          <div className="overline">ADD TO KREIS</div>
          <div className="quick-add-heading">
            <h1>New {contextAdd.kind === 'browser' ? 'browser link' : contextAdd.kind === 'folder' ? 'folder' : 'application'} shortcut</h1>
            <button className="icon-button" onClick={() => void closeLauncher()} aria-label="Cancel Add to Kreis"><X/></button>
          </div>
          <p className="quick-add-target" title={contextAdd.target}>{contextAdd.target}</p>
          <label>Shortcut label
            <input autoFocus maxLength={30} value={contextLabel} onChange={event => setContextLabel(event.target.value)}/>
          </label>
          <label>Place shortcut in
            <select value={contextGroupId} onChange={event => setContextGroupId(event.target.value)}>
              <option value="" disabled={getChildren(settings.entries).length >= MAX_ITEMS_PER_WHEEL}>Main Kreis</option>
              {flattenHierarchy(settings.entries).filter(item => item.entry.type === 'group').map(({entry, depth}) => (
                <option key={entry.id} value={entry.id} disabled={getChildren(settings.entries, entry.id).length >= MAX_ITEMS_PER_WHEEL}>
                  {`${'　'.repeat(depth)}↳ ${entry.title}`}
                  {getChildren(settings.entries, entry.id).length >= MAX_ITEMS_PER_WHEEL ? ' (full)' : ''}
                </option>
              ))}
            </select>
          </label>
          {contextAdd.kind === 'browser' && <label>Browser profile
            <select value={contextProfile} onChange={event => setContextProfile(event.target.value)}>
              {!settings.browserProfiles.some(p => p.id === contextProfile) && <option value="">Choose a profile</option>}
              {settings.browserProfiles.map(p => <option key={p.id} value={p.id}>
                {BROWSER_OPTIONS.find(b => b.id === p.browserId)?.name} · {p.name}
              </option>)}
            </select>
          </label>}
          <p className="helper">Choose any nested group, or Main Kreis. Nothing is saved until you confirm.</p>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <div className="quick-add-actions">
            <button className="secondary" onClick={() => void closeLauncher()}>Cancel</button>
            <button className="primary" disabled={busy || (contextAdd.kind === 'browser' && !settings.browserProfiles.some(p => p.id === contextProfile))} onClick={() => void saveContextAddition()}><Check size={16}/> Add shortcut</button>
          </div>
        </div>
      ) : screen === 'wheel' ? (
        <>
        <RadialWheel
          key={activeLevel ? `${activeLevel.kind}-${activeLevel.entry.id}-${tabPage}-${wheelEpoch}` : `main-${wheelEpoch}`}
          buttons={wheelButtons}
          appearance={settings.appearance}
          submenuTitle={activeLevel?.entry.title}
          tabCount={levelCount}
          countLabel={levelCountLabel}
          busy={busy}
          keyboardDisabled={Boolean(wheelEdit) || Boolean(draft)}
          error={error}
          page={tabPage}
          pageCount={pageCount}
          onSettings={() => openSettingsWheel()}
          onBack={backOneLevel}
          onHubDrag={() => void moveKreisByHub()}
          onClose={() => void closeLauncher()}
          onPageChange={setTabPage}
          allowRearrange={!activeLevel || activeLevel.kind === 'group'}
          allowMoveUp={activeLevel?.kind === 'group'}
          onDropWedge={dropWheelWedge}
          onContextAction={handleWheelContextAction}
          groupCreation={pendingGroup}
          onGroupNameChange={name => setPendingGroup(current => current ? { ...current, name } : null)}
          onConfirmGroup={() => void confirmWheelGroup()}
          onCancelGroup={() => setPendingGroup(null)}
          feedback={wheelFeedback}
          canUndo={Boolean(undoEntries)}
          onUndo={() => void undoWheelDrop()}
        />
        {wheelEdit && editedWheelEntry && (
          <WheelItemDialog
            key={`${wheelEdit.entryId}:${wheelEdit.mode}`}
            entry={editedWheelEntry} entries={settings.entries}
            mode={wheelEdit.mode} busy={busy} error={error}
            onSave={saveWheelItem}
            onDelete={() => deleteWheelItem(wheelEdit.entryId)}
            onClose={() => { setWheelEdit(null); setError(''); }}
          />
        )}
        </>
      ) : (
        <div className="settings-shell">
          <header className="settings-header">
            <div className="settings-header-leading">
              <button className="icon-button" onClick={() => void backToSettingsWheel()}
                aria-label="Back to Settings wheel" title="Back to Settings wheel"><ArrowLeft size={20}/></button>
              <div>
                <div className="overline">KREIS SETTINGS</div>
                <h1>{settingsCategoryTitle(settingsSection)} <small>0.12.0</small></h1>
                <p>{SETTINGS_CATEGORIES.find(category => category.key === settingsSection)?.description}</p>
              </div>
            </div>
            <button className="icon-button" onClick={() => void closeSettings()}
              aria-label="Close Kreis settings" title="Close Kreis"><X/></button>
          </header>
          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && <div className="alert" onClick={() => setNotice('')}>{notice} <X size={14}/></div>}
          <div className={`settings-body settings-body--${settingsSection}`}>
            {settingsSection === 'hotkey' && <section className="setting-section"><div className="section-title"><h2>Global shortcut</h2><span>Anywhere in Windows</span></div><div className="shortcut-row"><input aria-label="Global shortcut" value={shortcutDraft} onChange={event => setShortcutDraft(event.target.value)} placeholder="Control+Space"/><button className="primary" onClick={() => void saveShortcut()}><Save size={16}/> Apply</button></div><p className="helper">Examples: Control+Space, Control+Alt+K, Alt+Shift+Space. If a shortcut is already claimed, Kreis reports an error and preserves the previous binding.</p></section>}
            
            {settingsSection === 'typography' && <section className="setting-section">
              <div className="section-title"><h2>Wheel typography</h2><span>Main wheel and tab sub-wheels</span></div>
              <div className="appearance-controls">
                <label>
                  Font family
                  <select value={appearanceDraft.fontFamily}
                    onChange={event => setAppearanceDraft({ ...appearanceDraft, fontFamily: event.target.value as WheelFont })}>
                    {WHEEL_FONTS.map(font => <option key={font} value={font}>{font}</option>)}
                  </select>
                </label>
                <label>
                  <span>Shortcut labels <strong>{appearanceDraft.labelSize}px</strong></span>
                  <input type="range" min={10} max={18} step={1} aria-label="Shortcut label font size"
                    value={appearanceDraft.labelSize}
                    onChange={event => setAppearanceDraft({ ...appearanceDraft, labelSize: Number(event.target.value) })}/>
                </label>
                <label>
                  <span>Center label <strong>{appearanceDraft.centerSize}px</strong></span>
                  <input type="range" min={13} max={24} step={1} aria-label="Center label font size"
                    value={appearanceDraft.centerSize}
                    onChange={event => setAppearanceDraft({ ...appearanceDraft, centerSize: Number(event.target.value) })}/>
                </label>
              </div>
              <div className="appearance-preview" style={{ fontFamily: wheelFontStack(appearanceDraft.fontFamily) }}>
                <span className="sample-label" style={{ fontSize: appearanceDraft.labelSize }}>Google · Wikipedia</span>
                <span className="sample-center" style={{ fontSize: appearanceDraft.centerSize }}>KREIS</span>
              </div>
              <p className="helper">Uses fonts installed on your PC, with Segoe UI as a fallback. Larger fonts may abbreviate long tab titles; the full title stays in the tooltip.</p>
              <div className="appearance-actions">
                <button className="secondary" onClick={() => setAppearanceDraft(DEFAULT_APPEARANCE)}>Reset preview</button>
                <button className="primary" onClick={() => void saveAppearance()}><Save size={16}/> Apply typography</button>
              </div>
            </section>}
            {settingsSection === 'shortcuts' && <section className="setting-section">
              <div className="section-title">
                <h2>Shortcuts and groups <span className="count">{rootEntries.length}/{MAX_ITEMS_PER_WHEEL} main · {settings.entries.length} total</span></h2>
                <div className="section-buttons">
                  <button className="secondary" disabled={!canAddToAnyWheel}
                    onClick={() => { setDraft({ ...DEFAULT_GROUP, groupId: defaultNewParent }); setError(''); }}>
                    <Plus size={16}/> Add group
                  </button>
                  <button className="secondary" disabled={!canAddToAnyWheel}
                    onClick={() => { setDraft(assignProfile({ ...DEFAULT_NEW, groupId: defaultNewParent }, settings.browserProfiles[0] || null)); setError(''); }}>
                    <Plus size={16}/> Add shortcut
                  </button>
                </div>
              </div>
              <p className="helper">Organize shortcuts into groups, and nest groups inside other groups. Edit any entry to choose its parent group, or click + on a group to add a subgroup. Each Kreis holds up to 10 items. Older 11/12-slice Kreise stay intact until you reorganize them. Back moves up one level.</p>
              <div className="entry-list">
                {arrangedEntries.map(({ entry, depth }) => {
                  const Icon = icons[entry.icon] || icons.rocket;
                  const siblings = settings.entries.filter(item => (item.groupId || '') === (entry.groupId || ''));
                  const siblingIndex = siblings.findIndex(item => item.id === entry.id);
                  const isGroup = entry.type === 'group';
                  return (
                    <div className={`entry-row${isGroup ? ' entry-row--group' : ''}${depth > 0 ? ' entry-row--child' : ''}`} key={entry.id}
                      style={{ '--indent-size': `${Math.min(depth * 22, 132)}px` } as CSSProperties}>
                      <div className="entry-icon" style={{background: entry.color}}><Icon size={20}/></div>
                      <div className="entry-name">
                        <strong>{entry.title}</strong>
                        <small>{isGroup ? `Group · ${childrenFor(entry.id).length} items`
                          : entry.type === 'app' ? 'Windows app' : entry.type === 'folder' ? 'File Explorer folder' : `${BROWSER_OPTIONS.find(b => b.id === entry.browserId)?.name || 'Browser'} · ${profileForEntry(entry,settings.browserProfiles)?.name || 'Unassigned'}`}</small>
                      </div>
                      <span className="entry-target" title={entry.target}>
                        {isGroup ? (entry.groupId ? 'Sub-Kreis' : 'Group Kreis') : entry.target}
                      </span>
                      <div className="entry-actions">
                        {isGroup && <button className="tiny add-subgroup" title={`Create a subgroup inside ${entry.title}`}
                          aria-label={`Add subgroup inside ${entry.title}`}
                          disabled={childrenFor(entry.id).length >= MAX_ITEMS_PER_WHEEL}
                          onClick={() => { setDraft({ ...DEFAULT_GROUP, groupId: entry.id }); setError(''); }}>
                          <Plus size={15}/>
                        </button>}
                        <button className="tiny" aria-label={`Move ${entry.title} up`} disabled={siblingIndex <= 0}
                          onClick={() => void moveEntry(entry.id, -1)}>↑</button>
                        <button className="tiny" aria-label={`Move ${entry.title} down`} disabled={siblingIndex >= siblings.length - 1}
                          onClick={() => void moveEntry(entry.id, 1)}>↓</button>
                        <button className="tiny" onClick={() => { setDraft({...entry}); setError(''); }}>Edit</button>
                        <button className="tiny danger" aria-label={`Delete ${entry.title}`}
                          onClick={() => void deleteEntry(entry.id)}><Trash2 size={15}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>}
            {settingsSection === 'integrations' && <section className="setting-section">
              <div className="section-title"><h2>Explorer context menus</h2><span>Current Windows user only</span></div>
              <p className="helper">Add “Add to Kreis” when right-clicking folders, .exe files and .lnk shortcuts in File Explorer. On Windows 11 the entry is typically under “Show more options.” This uses per-user registry entries, without administrator access.</p>
              <div className="shortcut-row" style={{marginTop: 20}}>
                <button className="primary" onClick={() => void toggleContextMenuIntegration()}>
                  {contextMenuEnabled ? 'Disable Explorer context menus' : 'Enable Explorer context menus'}
                </button>
                <strong className={contextMenuEnabled ? 'online' : 'offline'}>{contextMenuEnabled ? 'Enabled' : 'Disabled'}</strong>
              </div>
              <p className="helper">Right-click a website or link in a paired Chromium browser for “Add link/page to Kreis.” Load extension v0.4.0 for new profiles. Kreis must be running in the tray.</p>
            </section>}
            {settingsSection === 'connection' && <BrowserProfilesPanel
              profiles={settings.browserProfiles} connected={profiles} entries={settings.entries} pairingKey={pairingKey}
              onRefresh={() => void getProfiles().then(setProfiles)}
              onAdd={(name, browserId) => void createBrowserProfile(name, browserId)}
              onRename={(id, name) => void changeBrowserProfileName(id, name)}
              onDelete={(id, replacementId) => void removeBrowserProfile(id, replacementId)}
            />}
            <div className="bottom-actions">
              {settingsSection === 'shortcuts' && <button className="secondary" onClick={() => void persist({...settings, entries: createStarterEntries()})}><RotateCcw size={15}/> Restore starter shortcuts</button>}
              <button className="primary" onClick={() => void backToSettingsWheel()}><ArrowLeft size={16}/> Back to settings</button>
            </div>
          </div>
          {draft && (
            <div className="dialog-backdrop">
              <div className="edit-dialog" role="dialog" aria-modal="true" aria-label="Edit wheel entry">
                <div className="dialog-heading">
                  <h2>{draft.id ? 'Edit entry' : draft.type === 'group' ? 'Add group' : 'Add shortcut'}</h2>
                  <button className="icon-button" onClick={() => setDraft(null)}><X/></button>
                </div>
                <div className="form-grid">
                  <label>Label
                    <input value={draft.title} maxLength={30}
                      onChange={event => setDraft({...draft, title: event.target.value})}
                      placeholder={draft.type === 'group' ? 'My group' : 'My favorite tab'}/>
                  </label>
                  <label>Type
                    <select value={draft.type} disabled={Boolean(draft.id)}
                      onChange={event => {
                        const type = event.target.value as Entry['type'];
                        setDraft({
                          ...draft, type,
                          target: type === 'folder' ? DEFAULT_FOLDER.target
                            : type === 'app' ? 'Code.exe' : type === 'browser' ? 'https://' : '',
                          icon: type === 'folder' ? DEFAULT_FOLDER.icon
                            : type === 'group' ? 'folder' : draft.icon,
                          windowTitle: undefined
                        });
                      }}>
                      <option value="browser">Browser tab</option>
                      <option value="app">Windows application</option>
                      <option value="folder">Windows folder</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                  {draft.type !== 'group' && (
                    <>
                      <label className="wide">{draft.type === 'browser' ? 'Website URL' : draft.type === 'folder' ? 'Folder path' : 'Executable name or full .exe path'}
                        <input value={draft.target}
                          onChange={event => setDraft({...draft, target: event.target.value})}
                          placeholder={draft.type === 'browser' ? 'https://example.com/' : draft.type === 'folder' ? 'shell:Downloads' : 'Code.exe'}/>
                      </label>
                      {draft.type !== 'folder' && <label className="wide">
                        {draft.type === 'browser' ? 'Tab title contains (optional)' : 'Window title contains (optional)'}
                        <input value={draft.windowTitle || ''}
                          onChange={event => setDraft({...draft, windowTitle: event.target.value})}
                          placeholder={draft.type === 'browser' ? 'For example: docs' : 'For example: release notes'}/>
                        <small className="helper">
                          {draft.type === 'browser'
                            ? 'Matches both the URL and this text in the tab title (case-insensitive). Leave blank for all matching tabs.'
                            : 'Leave blank to select from all windows. Matching a title focuses only that workspace.'}
                        </small>
                      </label>}
                      {draft.type === 'folder' && (
                        <p className="helper wide">Kreis focuses an already-open Downloads/other folder when possible, otherwise adds a tab to an existing File Explorer window on Windows 11. If no Explorer window exists, it opens a new one. Supports shell:Downloads (including relocated Downloads), absolute paths, environment variables, and ~ paths.</p>
                      )}
                      {draft.type === 'browser' && (
                        <>
                          <label>Browser and profile
                            <select value={draft.profileId !== undefined ? draft.profileId : draft.profile}
                              onChange={event => setDraft(assignProfile(draft, settings.browserProfiles.find(profile => profile.id === event.target.value) || null))}>
                              <option value="">Unassigned (cannot launch until assigned)</option>
                              {settings.browserProfiles.map(profile =>
                                <option key={profile.id} value={profile.id}>
                                  {BROWSER_OPTIONS.find(browser => browser.id === profile.browserId)?.name} · {profile.name}
                                </option>)}
                            </select>
                          </label>
                          <label>Tab matching
                            <select value={draft.match}
                              onChange={event => setDraft({...draft, match: event.target.value as Entry['match']})}>
                              <option value="prefix">URL path prefix (subpages too)</option>
                              <option value="exact">Exact URL (ignores hash)</option>
                              <option value="site">Website excluding /wp-admin/</option>
                            </select>
                          </label>
                        </>
                      )}
                    </>
                  )}
                      <label>{draft.type === 'group' ? 'Parent group' : 'Placement'}
                        <select value={draft.groupId || ''}
                          onChange={event => setDraft({...draft, groupId: event.target.value || undefined})}>
                          <option value="">Main Kreis (top level)</option>
                          {eligibleParentGroups(settings.entries, draft.id).map(group => (
                            <option key={group.id} value={group.id}>
                              {`${'　'.repeat(group.depth)}↳ ${group.title}`}
                            </option>
                          ))}
                        </select>
                      </label>
                  <IconPicker value={draft.icon} color={draft.color}
                    onChange={icon => setDraft(current => current ? {...current, icon} : current)}/>
                  <ColorPicker value={draft.color}
                    onChange={color => setDraft(current => current ? {...current, color} : current)}/>
                </div>
                {draft.type === 'group' && <p className="helper">Groups can contain shortcuts and other groups. Pick a parent to nest this Kreis, or leave it at the top level. Its descendants cannot be selected as parents.</p>}
                {error && <p className="dialog-error" role="alert">{error}</p>}
                <div className="dialog-actions">
                  <button className="secondary" onClick={() => setDraft(null)}>Cancel</button>
                  <button className="primary" onClick={() => void saveEntry()}><Check size={16}/> Save entry</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {!isReady && !error && <span className="sr-only">Loading Kreis...</span>}
    </main>
  );
}
