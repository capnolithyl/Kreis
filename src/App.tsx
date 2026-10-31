import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { load, type Store } from '@tauri-apps/plugin-store';
import { ArrowLeft, Check, ChevronDown, CircleHelp, Copy, Download, FileJson, Minus, Plus, RotateCcw, Save, Settings2, Trash2, Upload, X } from 'lucide-react';
import { focusAppWindow, focusBrowserTab, getMatchingTabs, getPairingKey, getProfiles, getLiveProfileTabs, setBrowserProfiles, hideWheel, launch, startHubDrag, listAppWindows, openFolder, openNewBrowserTab, toggleWheel, type AppWindow, type BrowserTab, type ContextAdd, takeStartupContext, windowsContextMenuEnabled, setWindowsContextMenu, setSettingsPickerActive } from './bridge';
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
import WheelColorPicker from './WheelColorPicker';
import { defaultContextAppearance } from './contextAppearance.mjs';
import { groupLiveTabs, type LiveProfile } from './liveTabs.mjs';
import { MAX_SETTINGS_FILE_BYTES, parseSettingsImport, serializeSettings, type SettingsImportPreview } from './settingsIO.mjs';
import { eligibleParentGroups, flattenHierarchy, getChildren, removeGroup, suggestParent, validateHierarchy } from './groupHierarchy.mjs';
import { dropEntry, type DropMode } from './groupDragDrop.mjs';
import type { CSSProperties } from 'react';

type WheelLevel =
  | { kind: 'settings'; entry: Entry }
  | { kind: 'group'; entry: Entry }
  | { kind: 'tabs'; entry: Entry; tabs: BrowserTab[] }
  | { kind: 'apps'; entry: Entry; windows: AppWindow[] }
  | { kind: 'live-profiles'; entry: Entry; profiles: LiveProfile[]; unavailable: string[] }
  | { kind: 'live-domains'; entry: Entry; profile: LiveProfile }
  | { kind: 'live-tabs'; entry: Entry; profileId: string; domain: string; tabs: BrowserTab[] };

const MAX_ITEMS_PER_WHEEL = 10;
/** Synthetic entry to reuse Back and nested-wheel rendering without saving a settings shortcut. */
const SETTINGS_ENTRY: Entry = { id: 'kreis-settings', title: 'Settings', type: 'group', target: '', profile: 'Work', match: 'prefix', icon: 'settings', color: '#617cae' };
const DEFAULT_FOLDER: Entry = { id: '', title: '', type: 'folder', target: 'shell:Downloads', profile: 'Work', match: 'prefix', icon: 'folder', color: '#c1a062' };
const DEFAULT_GROUP: Entry = { id: '', title: '', type: 'group', target: '', profile: 'Work', match: 'prefix', icon: 'folder', color: '#6a8ec2' };
const DEFAULT_LIVE: Entry = { id: '', title: 'Live Tabs', type: 'live-tabs', target: 'connected', profile: 'Work', match: 'prefix', icon: 'layers', color: '#4c87a8' };
const LIVE_COLORS = ['#497cc8', '#4b9a86', '#aa73b6', '#c48a4c', '#c26376', '#568fac', '#8d9a55', '#8d78c3'];
const LIVE_PAGE_SIZE = 8;
const DEFAULT_STACK: Entry = { id: '', title: '', type: 'vivaldi-stack', target: '', profile: 'Work', profileId: 'Work', browserId: 'vivaldi', match: 'exact', icon: 'layers', color: '#6a8ec2', recreateStack: false };
const DEFAULT_NEW: Entry = { id: '', title: '', type: 'browser', target: 'https://', profile: 'Work', match: 'prefix', icon: 'globe', color: '#6385d7' };
const wheelSize = 600;
const tabsPerPage = 7; // Keep the eighth slot for an explicit New Tab action.
const settingsSizes: Record<SettingsCategory, LogicalSize> = {
  hotkey: new LogicalSize(740, 390),
  typography: new LogicalSize(790, 485),
  shortcuts: new LogicalSize(900, 710),
  connection: new LogicalSize(850, 700),
  integrations: new LogicalSize(770, 455),
  backup: new LogicalSize(820, 650)
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
  const importFileInput = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<SettingsImportPreview | null>(null);
  const [importFilename, setImportFilename] = useState('');
  // React's InputHTMLAttributes does not expose the HTML file-input "cancel"
  // event yet. Attach it to the native input node while this panel is mounted.
  useEffect(() => {
    if(screen!=='settings'||settingsSection!=='backup')return;
    const input=importFileInput.current;
    if(!input)return;
    const onCancel=()=>{void finishSettingsFilePicker();};
    input.addEventListener('cancel',onCancel);
    return ()=>input.removeEventListener('cancel',onCancel);
  },[screen,settingsSection]);
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
  const [contextIcon, setContextIcon] = useState('globe');
  const [contextColor, setContextColor] = useState('#6385d7');
  const [contextColorOpen, setContextColorOpen] = useState(false);
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false);
  const latestSettings = useRef(settings);
  latestSettings.current = settings;

  function openContextPicker(entry: ContextAdd) {
    if (!['browser', 'folder', 'app', 'vivaldi-stack'].includes(entry.kind) || !entry.target) return;
    const appearance = defaultContextAppearance(entry.kind);
    setContextAdd(entry);
    setContextLabel(entry.title.slice(0, 30) || 'New shortcut');
    setContextIcon(appearance.icon);
    setContextColor(appearance.color);
    setContextColorOpen(false);
    setContextGroupId(suggestParent(latestSettings.current.entries, MAX_ITEMS_PER_WHEEL) || '');
    const configured = latestSettings.current.browserProfiles;
    const eligible = entry.kind === 'vivaldi-stack'
      ? configured.filter(profile => profile.browserId === 'vivaldi') : configured;
    setContextProfile(eligible.some(profile => profile.id === entry.profile)
      ? entry.profile! : (eligible[0]?.id || ''));
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
      ...(['browser', 'vivaldi-stack'].includes(contextAdd.kind) ? {
        profileId: contextProfile,
        browserId: settings.browserProfiles.find(profile => profile.id === contextProfile)?.browserId
      } : {}),
      ...(contextAdd.kind === 'vivaldi-stack' ? { recreateStack: false } : {}),
      match: ['browser', 'vivaldi-stack'].includes(contextAdd.kind) ? 'exact' : 'prefix',
      icon: contextIcon,
      color: contextColor,
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


  /** Portable backup of saved preferences only; browser pairing secrets stay local. */
  function exportSettingsFile() {
    setError('');
    try {
      const blob=new Blob([serializeSettings(settings)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      const stamp=new Date().toISOString().slice(0,19).replace(/:/g,'-').replace('T','_');
      anchor.href=url;
      anchor.download='kreis-settings-'+stamp+'.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      setNotice('Settings JSON exported. The browser pairing key is not included.');
    } catch(cause) { setError('Could not export settings: '+String(cause)); }
  }

  /** The Windows picker temporarily steals focus, but that must not hide Kreis. */
  async function openSettingsFilePicker() {
    if(!importFileInput.current)return;
    setError('');
    try {
      // Await the native guard *before* invoking the OS file picker. Without
      // this the window's Focused(false) handler hides the entire UI.
      await setSettingsPickerActive(true);
      importFileInput.current.click();
    } catch(cause) {
      await setSettingsPickerActive(false).catch(()=>{});
      setError('Could not open the JSON file picker: '+String(cause));
    }
  }

  async function finishSettingsFilePicker() {
    try {
      // Re-show and focus even if WebView2 sent a blur for the system dialog.
      await window.show();
      await window.setFocus();
    } catch(cause) {
      setError('Could not restore Kreis after file selection: '+String(cause));
    } finally {
      // Also runs on Cancel and parse errors; never leave blur protection on.
      await setSettingsPickerActive(false).catch(error=>{
        setError('Could not restore normal window behavior: '+String(error));
      });
    }
  }

  async function selectSettingsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value='';
    setImportPreview(null);
    setImportFilename('');
    setError('');
    setNotice('');
    try{
      if(!file)return;
      if(file.size>MAX_SETTINGS_FILE_BYTES)throw Error('Choose a JSON file no larger than 2 MB.');
      const parsed=parseSettingsImport(await file.text(),settings);
      setImportFilename(file.name);
      setImportPreview(parsed);
    }catch(cause){setError(String(cause));}
    finally{await finishSettingsFilePicker();}
  }

  async function applySettingsImport() {
    if(!importPreview||busyRef.current)return;
    const previous=settings,next=importPreview.settings;
    busyRef.current=true;setBusy(true);setError('');
    try {
      // Reject occupied/invalid hotkeys before touching persistent settings.
      if(next.shortcut!==previous.shortcut)await registerShortcut(next.shortcut);
      await persist(next);
      setShortcutDraft(next.shortcut);
      setAppearanceDraft(next.appearance);
      setImportPreview(null);
      setImportFilename('');
      setNotice('Settings imported. Your shortcut layout and browser profiles are ready.');
    }catch(cause){
      try{
        if(activeShortcut.current!==previous.shortcut)await registerShortcut(previous.shortcut);
        await setBrowserProfiles(previous.browserProfiles);
        if(store.current){
          await store.current.set('settings',previous);
          await store.current.save();
        }
      }catch(rollbackError){
        setError('Import failed: '+String(cause)+'. Restore may be incomplete: '+String(rollbackError));
        busyRef.current=false;setBusy(false);
        return;
      }
      setError('Import not applied: '+String(cause));
    }finally{
      busyRef.current=false;setBusy(false);
    }
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
    setImportPreview(null);
    setImportFilename('');
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
      if (entry.type === 'live-tabs') {
        // Re-query all configured browser profiles on every shortcut opening.
        const results = await Promise.all(settings.browserProfiles.map(async profile => {
          try { return { profile, tabs: await getLiveProfileTabs(profile.id) }; }
          catch { return { profile, tabs: null }; }
        }));
        if (generation !== selectionGeneration.current) return;
        const snapshot = groupLiveTabs(results);
        if (!snapshot.profiles.length) {
          throw Error(snapshot.unavailable.length === settings.browserProfiles.length
            ? 'No paired browser profiles are connected. Open a browser and check Settings → Connection.'
            : 'No readable web tabs found in connected browser profiles.');
        }
        pushLevel({kind:'live-profiles',entry,...snapshot});
        setWheelFeedback(snapshot.unavailable.length
          ? 'Skipped disconnected profiles: ' + snapshot.unavailable.join(', ') : '');
        return;
      }
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
      } else if (entry.type === 'vivaldi-stack') {
        const profile = profileForEntry(entry, settings.browserProfiles);
        if (!profile || profile.browserId !== 'vivaldi') throw new Error('Assign this shortcut to a Vivaldi browser profile.');
        const tabs = await getMatchingTabs(entry);
        if (generation !== selectionGeneration.current) return;
        if (!tabs) throw new Error('Vivaldi companion did not respond. Update/reload extension v0.5.0 or check native stack support.');
        if (!tabs.length) throw new Error('No open Vivaldi stack named "' + entry.target + '". Enable recreation in the shortcut if desired.');
        await focusBrowserTab(entry.profileId ?? entry.profile, tabs[0].id);
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

  async function selectLiveTab(tab: BrowserTab, profileId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const generation = selectionGeneration.current;
    try {
      await focusBrowserTab(profileId, tab.id);
      if (generation === selectionGeneration.current) await closeLauncher();
    } catch(cause) {
      if (generation === selectionGeneration.current)
        setError('This tab may have closed or moved. Reopen Live Tabs to refresh. ' + String(cause));
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
    if ((draft.type === 'browser' || draft.type === 'vivaldi-stack') && !profileForEntry(draft, settings.browserProfiles)) {
      return setError('Select a configured browser profile. You can add one under Settings → Connection.');
    }
    if (draft.type === 'vivaldi-stack' && profileForEntry(draft, settings.browserProfiles)?.browserId !== 'vivaldi')
      return setError('Choose a Vivaldi profile for native Tab Stacks.');
    const entry: Entry = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim(),
      target: draft.type === 'group' ? '' : draft.target.trim(),
      // Groups and shortcuts share the same parent ID for unlimited sub-Kreise.
      groupId: draft.groupId || undefined,
      windowTitle: draft.type === 'app' || draft.type === 'browser'
        ? draft.windowTitle?.trim() || undefined : undefined,
      stackStartUrl: draft.type === 'vivaldi-stack' ? draft.stackStartUrl?.trim() || undefined : undefined
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
      ? Math.ceil(activeLevel.windows.length / 8)
    : activeLevel?.kind === 'live-profiles'
      ? Math.ceil(activeLevel.profiles.length / LIVE_PAGE_SIZE)
    : activeLevel?.kind === 'live-domains'
      ? Math.ceil(activeLevel.profile.domains.length / LIVE_PAGE_SIZE)
    : activeLevel?.kind === 'live-tabs'
      ? Math.ceil(activeLevel.tabs.length / LIVE_PAGE_SIZE) : 1;
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
    : activeLevel?.kind === 'live-profiles'
      ? activeLevel.profiles.slice(tabPage * LIVE_PAGE_SIZE,(tabPage + 1) * LIVE_PAGE_SIZE)
        .map((p,index) => ({
          key: p.profile.id, title: (BROWSER_OPTIONS.find(b => b.id === p.profile.browserId)?.name || p.profile.browserId) + ' · ' + p.profile.name,
          color: LIVE_COLORS[(tabPage * LIVE_PAGE_SIZE + index) % LIVE_COLORS.length],
          icon: 'monitor', isGroup: true,
          tooltip: p.profile.browserId + ' · ' + p.tabCount + ' open web tabs across ' + p.domains.length + ' domains',
          onSelect: () => pushLevel({kind:'live-domains',entry:activeLevel.entry,profile:p})
        }))
    : activeLevel?.kind === 'live-domains'
      ? activeLevel.profile.domains.slice(tabPage * LIVE_PAGE_SIZE,(tabPage + 1) * LIVE_PAGE_SIZE)
        .map((domain,index) => ({
          key:domain.domain, title:domain.domain,
          color:LIVE_COLORS[(tabPage * LIVE_PAGE_SIZE + index) % LIVE_COLORS.length], icon:'globe', isGroup:true,
          tooltip:domain.domain + ' · ' + domain.tabs.length + ' open tabs',
          onSelect: () => pushLevel({kind:'live-tabs',entry:activeLevel.entry,
            profileId:activeLevel.profile.profile.id,domain:domain.domain,tabs:domain.tabs})
        }))
    : activeLevel?.kind === 'live-tabs'
      ? activeLevel.tabs.slice(tabPage * LIVE_PAGE_SIZE,(tabPage + 1) * LIVE_PAGE_SIZE)
        .map(tab => ({
          key:'live-tab-' + tab.id,
          title:tab.title || tab.url || 'Untitled tab',
          color:activeLevel.entry.color, icon:'globe',
          tooltip:(tab.title || 'Untitled tab') + ' · ' + (tab.url || ''),
          onSelect: () => void selectLiveTab(tab,activeLevel.profileId)
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
              : entry.type === 'live-tabs' ? 'Browse all open web tabs by browser profile and domain'
              : `${entry.title} (${(entry.type === 'browser' || entry.type === 'vivaldi-stack') ? (profileForEntry(entry, settings.browserProfiles)?.name || 'Unassigned profile') : entry.type === 'folder' ? 'File Explorer' : 'Windows'})`,
            onSelect: () => void selectEntry(entry)
          }));

  const levelCount = activeLevel?.kind === 'settings' ? SETTINGS_CATEGORIES.length
    : activeLevel?.kind === 'group'
    ? currentOptions.length
    : activeLevel?.kind === 'tabs' ? activeLevel.tabs.length
      : activeLevel?.kind === 'apps' ? activeLevel.windows.length
      : activeLevel?.kind === 'live-profiles' ? activeLevel.profiles.length
      : activeLevel?.kind === 'live-domains' ? activeLevel.profile.domains.length
      : activeLevel?.kind === 'live-tabs' ? activeLevel.tabs.length : 0;
  const levelCountLabel = activeLevel?.kind === 'settings' ? 'categories'
    : activeLevel?.kind === 'group' ? 'shortcuts'
    : activeLevel?.kind === 'apps' ? 'windows'
    : activeLevel?.kind === 'live-profiles' ? 'profiles'
    : activeLevel?.kind === 'live-domains' ? 'domains' : 'tabs';
  const ContextIcon = icons[contextIcon] || icons.globe;

  return (
    <main className={screen === 'wheel' ? 'wheel-screen' : 'settings-screen'}>
      {screen === 'context' && contextAdd ? (
        <div className="quick-add-shell">
          <div className="overline">ADD TO KREIS</div>
          <div className="quick-add-heading">
            <h1>New {contextAdd.kind === 'browser' ? 'browser link' : contextAdd.kind === 'vivaldi-stack' ? 'Vivaldi Tab Stack' : contextAdd.kind === 'folder' ? 'folder' : 'application'} shortcut</h1>
            <button className="icon-button" onClick={() => void closeLauncher()} aria-label="Cancel Add to Kreis"><X/></button>
          </div>
          <p className="quick-add-target" title={contextAdd.target}>{contextAdd.target}</p>
          <div className="quick-add-fields">
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
            {(contextAdd.kind === 'browser' || contextAdd.kind === 'vivaldi-stack') && <label>Browser profile
              <select value={contextProfile} onChange={event => setContextProfile(event.target.value)}>
                {!settings.browserProfiles.some(p => p.id === contextProfile) && <option value="">Choose a profile</option>}
                {settings.browserProfiles.filter(p => contextAdd.kind !== 'vivaldi-stack' || p.browserId === 'vivaldi').map(p => <option key={p.id} value={p.id}>
                  {BROWSER_OPTIONS.find(b => b.id === p.browserId)?.name} · {p.name}
                </option>)}
              </select>
            </label>}
            <div className="quick-add-appearance" aria-label="Shortcut appearance">
              <div className="quick-add-preview">
                <span className="quick-add-preview-icon" style={{ backgroundColor: contextColor }}>
                  <ContextIcon size={19} strokeWidth={2} aria-hidden="true"/>
                </span>
                <span className="quick-add-preview-name" title={contextLabel}>{contextLabel.trim() || 'New shortcut'}</span>
                <small>Preview</small>
              </div>
              <div className="quick-add-appearance-fields">
                <IconPicker value={contextIcon} color={contextColor} onChange={setContextIcon}/>
                <div className="appearance-field">
                  <span className="appearance-label" id="quick-add-color-label">Color</span>
                  <button type="button" className="quick-add-color-trigger"
                    aria-labelledby="quick-add-color-label" aria-expanded={contextColorOpen}
                    aria-controls="quick-add-color-editor"
                    onClick={() => setContextColorOpen(open => !open)}>
                    <span className="quick-add-color-swatch" style={{ backgroundColor: contextColor }} aria-hidden="true"/>
                    <span className="quick-add-color-info"><strong>{contextColor.toUpperCase()}</strong><small>Choose color</small></span>
                    <ChevronDown size={18} className={contextColorOpen ? 'icon-picker-chevron is-open' : 'icon-picker-chevron'}/>
                  </button>
                </div>
              </div>
              {contextColorOpen && (
                <div className="quick-add-color-editor" id="quick-add-color-editor">
                  <WheelColorPicker value={contextColor} onChange={setContextColor}/>
                </div>
              )}
            </div>
            <p className="helper">Choose a destination, icon and color. Nothing is saved until you confirm.</p>
          </div>
          {contextAdd.kind === 'vivaldi-stack' && <p className="helper">Saves a named-stack shortcut. Automatic recreation starts disabled and can be enabled later in settings.</p>}
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <div className="quick-add-actions">
            <button className="secondary" onClick={() => void closeLauncher()}>Cancel</button>
            <button className="primary" disabled={busy || (['browser', 'vivaldi-stack'].includes(contextAdd.kind) &&
              !settings.browserProfiles.some(p => p.id === contextProfile &&
                (contextAdd.kind !== 'vivaldi-stack' || p.browserId === 'vivaldi')))} onClick={() => void saveContextAddition()}><Check size={16}/> Add shortcut</button>
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
                <h1>{settingsCategoryTitle(settingsSection)} <small>0.15.0</small></h1>
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
                          : entry.type === 'live-tabs' ? 'Dynamic browser tab explorer'
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
            {settingsSection === 'backup' && <section className="setting-section settings-backup">
              <div className="section-title">
                <h2>Export configuration</h2><span>Portable JSON backup</span>
              </div>
              <p className="helper">Export your complete setup: shortcuts, nested groups, ordering, icons, colors, browser profiles, hotkey and wheel appearance. Save a backup or give the JSON file to ChatGPT to reorganize.</p>
              <div className="backup-actions">
                <button className="primary" disabled={busy} onClick={exportSettingsFile}>
                  <Download size={17}/> Export current settings
                </button>
                <span className="backup-counter">{settings.entries.length} slices · {settings.browserProfiles.length} profiles</span>
              </div>
            </section>}
            {settingsSection === 'backup' && <section className="setting-section settings-backup">
              <div className="section-title">
                <h2>Import configuration</h2><span>Review before replacing</span>
              </div>
              <p className="helper">Choose a Kreis JSON export, or an edited JSON file containing an <code>entries</code> list. Only sections present in the file are replaced. Selecting a file does not change anything.</p>
              <input ref={importFileInput} type="file" accept=".json,application/json" style={{display:'none'}}
                aria-label="Choose Kreis JSON file" onChange={event=>void selectSettingsFile(event)}/>
              <div className="backup-actions">
                <button className="secondary" disabled={busy} onClick={()=>void openSettingsFilePicker()}>
                  <Upload size={17}/> Choose JSON file
                </button>
                <span className="backup-counter">{importFilename||'No file selected'}</span>
              </div>
              {importPreview && <div className="backup-preview">
                <div className="backup-preview-heading"><FileJson size={21}/>
                  <div><strong>Ready to import</strong><small>{importFilename}</small></div>
                </div>
                <div className="backup-summary">
                  <div><strong>{importPreview.summary.shortcuts}</strong><span>Shortcuts</span></div>
                  <div><strong>{importPreview.summary.groups}</strong><span>Groups</span></div>
                  <div><strong>{importPreview.summary.browserProfiles}</strong><span>Profiles</span></div>
                </div>
                <p className="helper"><strong>Will replace:</strong> {importPreview.fields.map(field =>
                  field==='entries'?'shortcuts and groups':
                  field==='browserProfiles'?'browser profiles':
                  field==='shortcut'?'global hotkey':'typography').join(', ')}.</p>
                <p className="helper"><strong>Global hotkey after import:</strong> {importPreview.summary.hotkey}</p>
                {importPreview.warnings.map((warning,i)=><p className="backup-warning" key={i}>{warning}</p>)}
                <div className="backup-actions">
                  <button className="secondary" disabled={busy}
                    onClick={()=>{setImportPreview(null);setImportFilename('');}}>Cancel</button>
                  <button className="primary" disabled={busy} onClick={()=>void applySettingsImport()}>
                    <Check size={17}/> {busy?'Importing…':'Apply import'}
                  </button>
                </div>
              </div>}
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
                            : type === 'app' ? 'Code.exe' : type === 'browser' ? 'https://'
                            : type === 'live-tabs' ? DEFAULT_LIVE.target : '',
                          ...(type === 'vivaldi-stack' ? {
                            profileId: settings.browserProfiles.find(p => p.browserId === 'vivaldi')?.id || '',
                            browserId: 'vivaldi' as const, profile: 'Work',
                            icon: DEFAULT_STACK.icon, color: DEFAULT_STACK.color, match: 'exact' as const,
                            recreateStack: false, stackStartUrl: undefined
                          } : {}),
                          icon: type === 'folder' ? DEFAULT_FOLDER.icon
                            : type === 'group' ? 'folder'
                            : type === 'live-tabs' ? DEFAULT_LIVE.icon
                            : type === 'vivaldi-stack' ? DEFAULT_STACK.icon : draft.icon,
                          windowTitle: undefined
                        });
                      }}>
                      <option value="browser">Browser tab</option>
                      <option value="vivaldi-stack">Vivaldi named Tab Stack (experimental)</option>
                      <option value="live-tabs">Live Tabs · all connected browsers</option>
                      <option value="app">Windows application</option>
                      <option value="folder">Windows folder</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                  {draft.type !== 'group' && draft.type !== 'live-tabs' && (
                    <>
                      <label className="wide">{draft.type === 'browser' ? 'Website URL' : draft.type === 'vivaldi-stack' ? 'Stack name' : draft.type === 'folder' ? 'Folder path' : 'Executable name or full .exe path'}
                        <input value={draft.target}
                          onChange={event => setDraft({...draft, target: event.target.value})}
                          placeholder={draft.type === 'browser' ? 'https://example.com/' : draft.type === 'vivaldi-stack' ? 'Runagaldr' : draft.type === 'folder' ? 'shell:Downloads' : 'Code.exe'}/>
                      </label>
                      {draft.type !== 'folder' && draft.type !== 'vivaldi-stack' && <label className="wide">
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
                      {(draft.type === 'browser' || draft.type === 'vivaldi-stack') && (
                        <>
                          <label>Browser and profile
                            <select value={draft.profileId !== undefined ? draft.profileId : draft.profile}
                              onChange={event => setDraft(assignProfile(draft, settings.browserProfiles.find(profile => profile.id === event.target.value) || null))}>
                              <option value="">Unassigned (cannot launch until assigned)</option>
                              {settings.browserProfiles.filter(profile => draft.type !== 'vivaldi-stack' || profile.browserId === 'vivaldi').map(profile =>
                                <option key={profile.id} value={profile.id}>
                                  {BROWSER_OPTIONS.find(browser => browser.id === profile.browserId)?.name} · {profile.name}
                                </option>)}
                            </select>
                          </label>
                          {draft.type === 'browser' && <label>Tab matching
                            <select value={draft.match}
                              onChange={event => setDraft({...draft, match: event.target.value as Entry['match']})}>
                              <option value="prefix">URL path prefix (subpages too)</option>
                              <option value="exact">Exact URL (ignores hash)</option>
                              <option value="site">Website excluding /wp-admin/</option>
                            </select>
                          </label>}
                          {draft.type === 'vivaldi-stack' && <div className="wide">
                            <p className="helper">Focuses any tab in a native Vivaldi Tab Stack with this name. Experimental: Vivaldi's internal stack metadata may not be exposed to extensions.</p>
                            <label className="shortcut-row">
                              <input type="checkbox" checked={draft.recreateStack === true}
                                onChange={event => setDraft({...draft, recreateStack: event.target.checked})}/>
                              Create a new stack when missing (experimental)
                            </label>
                            {draft.recreateStack && <label>Starting URL (optional)
                              <input value={draft.stackStartUrl || ''} placeholder="https://example.com/"
                                onChange={event => setDraft({...draft, stackStartUrl: event.target.value})}/>
                              <small className="helper">Creates two new tabs, optionally starting on this page. Closed tabs cannot be restored by name alone.</small>
                            </label>}
                          </div>}
                        </>
                      )}
                    </>
                  )}
                      {draft.type === 'live-tabs' && <p className="helper wide">
                        Every opening reads current HTTP(S) tabs from paired browsers across all
                        windows, grouped by profile and hostname. No tab list is saved. Requires
                        browser companion v0.5.4; disconnected profiles are skipped.
                      </p>}
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
