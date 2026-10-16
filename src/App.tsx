import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { load, type Store } from '@tauri-apps/plugin-store';
import { ArrowLeft, Check, ChevronDown, CircleHelp, Copy, Minus, Plus, RotateCcw, Save, Settings2, Trash2, X } from 'lucide-react';
import { focusAppWindow, focusBrowserTab, getMatchingTabs, getPairingKey, getProfiles, hideWheel, launch, listAppWindows, openNewBrowserTab, toggleWheel, type AppWindow, type BrowserTab } from './bridge';
import { icons } from './icons';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, WHEEL_FONTS, normalizeAppearance, wheelFontStack, type Entry, type Settings, type WheelAppearance, type WheelFont, validateEntry } from './types';
import RadialWheel, { type WheelOption } from './RadialWheel';
import { filterByTitle } from './titleFilter.mjs';

type WheelLevel =
  | { kind: 'group'; entry: Entry }
  | { kind: 'tabs'; entry: Entry; tabs: BrowserTab[] }
  | { kind: 'apps'; entry: Entry; windows: AppWindow[] };

const MAX_ITEMS_PER_WHEEL = 12;
const DEFAULT_GROUP: Entry = { id: '', title: '', type: 'group', target: '', profile: 'Work', match: 'prefix', icon: 'folder', color: '#6a8ec2' };
const DEFAULT_NEW: Entry = { id: '', title: '', type: 'browser', target: 'https://', profile: 'Work', match: 'prefix', icon: 'globe', color: '#6385d7' };
const wheelSize = 600;
const tabsPerPage = 7; // Keep the eighth slot for an explicit New Tab action.
const editSize = new LogicalSize(820, 680);
const window = getCurrentWindow();

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [appearanceDraft, setAppearanceDraft] = useState<WheelAppearance>(DEFAULT_APPEARANCE);
  const [screen, setScreen] = useState<'wheel' | 'settings'>('wheel');
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

  const resetWheel = useCallback(() => {
    selectionGeneration.current++;
    setWheelEpoch(current => current + 1);
    busyRef.current = false;
    setBusy(false);
    setLevels([]);
    setTabPage(0);
    setError('');
  }, []);

  async function closeLauncher() {
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
        const next: Settings = saved?.entries && Array.isArray(saved.entries)
          ? { ...DEFAULT_SETTINGS, ...saved, appearance: normalizeAppearance(saved.appearance) }
          : DEFAULT_SETTINGS;
        if (disposed) return;
        store.current = loaded;
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
        const unlistenSettings = await listen('show-settings', () => { void openSettings(); });
        const unlistenWheel = await listen('kreis-wheel-opened', () => {
          resetWheel();
          setScreen('wheel');
        });
        const fn = () => { unlistenSettings(); unlistenWheel(); };
        if (disposed) fn(); else unlisten = fn;
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

  async function persist(next: Settings) {
    if (!store.current) throw new Error('Settings storage is not ready.');
    await store.current.set('settings', next);
    await store.current.save();
    setSettings(next);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (draft) { setDraft(null); return; }
        if (screen === 'settings') { void closeSettings(); return; }
        void closeLauncher();
      } else if (event.key === 'Backspace' && screen === 'wheel' && levels.length > 0) {
        event.preventDefault();
        backOneLevel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [draft, screen, levels]);

  async function openSettings() {
    resetWheel();
    setAppearanceDraft(settings.appearance);
    setScreen('settings');
    await window.setSize(editSize);
    await window.center();
    await window.show();
    await window.setFocus();
    try { setPairingKey(await getPairingKey()); setProfiles(await getProfiles()); }
    catch (cause) { setNotice(String(cause)); }
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
        const matchingUrlTabs = await getMatchingTabs(entry);
        if (generation !== selectionGeneration.current) return;
        const titleContains = entry.windowTitle?.trim() || '';
        // Never fall back to an unfiltered activation when the title filter
        // requires the extension. That could switch to an unrelated chat.
        if (titleContains && matchingUrlTabs === null) {
          throw new Error(`The ${entry.profile} browser extension did not respond. Tab title filtering requires a connected Vivaldi profile.`);
        }
        const tabs = matchingUrlTabs ? filterByTitle(matchingUrlTabs, titleContains) : null;
        if (titleContains && tabs?.length === 0) {
          throw new Error(`No open ${entry.profile} tab matching ${entry.title} has "${titleContains}" in its title.`);
        }
        if (tabs && tabs.length > 1) {
          pushLevel({ kind: 'tabs', entry, tabs });
          return;
        }
        if (tabs && tabs.length === 1) {
          await focusBrowserTab(entry.profile, tabs[0].id);
        } else {
          // For unfiltered links, retain the existing new-tab/default-browser fallback.
          const result = await launch(entry);
          if (result.details) setNotice(result.details);
        }
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
      await focusBrowserTab(entry.profile, tab.id);
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
    return settings.entries.filter(entry => entry.type !== 'group' && entry.groupId === groupId);
  }

  async function saveEntry() {
    if (!draft) return;
    const problem = validateEntry(draft);
    if (problem) return setError(problem);
    const groups = settings.entries.filter(entry => entry.type === 'group');
    if (draft.type !== 'group' && draft.groupId && !groups.some(group => group.id === draft.groupId)) {
      return setError('Select an existing group.');
    }
    const entry: Entry = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim(),
      target: draft.type === 'group' ? '' : draft.target.trim(),
      groupId: draft.type === 'group' ? undefined : draft.groupId || undefined,
      windowTitle: draft.type !== 'group' ? draft.windowTitle?.trim() || undefined : undefined
    };
    const entries = draft.id
      ? settings.entries.map(current => current.id === draft.id ? entry : current)
      : [...settings.entries, entry];
    const rootCount = entries.filter(item => !item.groupId).length;
    if (rootCount > MAX_ITEMS_PER_WHEEL) return setError('The main wheel can hold 12 shortcuts. Move an entry into a group first.');
    for (const group of entries.filter(item => item.type === 'group')) {
      if (entries.filter(item => item.groupId === group.id).length > MAX_ITEMS_PER_WHEEL) {
        return setError(`The ${group.title} group already has 12 shortcuts.`);
      }
    }
    try { await persist({ ...settings, entries }); setDraft(null); setError(''); }
    catch (cause) { setError(String(cause)); }
  }

  async function deleteEntry(id: string) {
    const removed = settings.entries.find(entry => entry.id === id);
    if (!removed) return;
    let entries = settings.entries.filter(entry => entry.id !== id);
    if (removed.type === 'group') {
      // Keep users' shortcuts when a group is removed.
      entries = entries.map(entry =>
        entry.groupId === id ? { ...entry, groupId: undefined } : entry
      );
      if (entries.filter(entry => !entry.groupId).length > MAX_ITEMS_PER_WHEEL) {
        return setError('Cannot remove this group: the main wheel would have over 12 items. Move or remove some members first.');
      }
    }
    try { await persist({ ...settings, entries }); setError(''); }
    catch (cause) { setError(String(cause)); }
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

  const groupIds = new Set(settings.entries.filter(entry => entry.type === 'group').map(entry => entry.id));
  const rootEntries = settings.entries.filter(entry => !entry.groupId || !groupIds.has(entry.groupId));
  const arrangedEntries = rootEntries.flatMap(entry =>
    entry.type === 'group' ? [entry, ...childrenFor(entry.id)] : [entry]
  );
  const activeLevel = levels[levels.length - 1];
  const currentOptions = activeLevel?.kind === 'group'
    ? childrenFor(activeLevel.entry.id) : rootEntries;

  const pageCount = activeLevel?.kind === 'tabs'
    ? Math.ceil(activeLevel.tabs.length / tabsPerPage)
    : activeLevel?.kind === 'apps'
      ? Math.ceil(activeLevel.windows.length / 8) : 1;
  const wheelButtons: WheelOption[] =
    activeLevel?.kind === 'tabs'
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
            tooltip: entry.type === 'group' ? `Open ${entry.title} group`
              : `${entry.title} (${entry.type === 'browser' ? entry.profile : 'Windows'})`,
            onSelect: () => void selectEntry(entry)
          }));

  const levelCount = activeLevel?.kind === 'group'
    ? currentOptions.length
    : activeLevel?.kind === 'tabs' ? activeLevel.tabs.length
      : activeLevel?.kind === 'apps' ? activeLevel.windows.length : 0;
  const levelCountLabel = activeLevel?.kind === 'group' ? 'shortcuts'
    : activeLevel?.kind === 'apps' ? 'windows' : 'tabs';

  return (
    <main className={screen === 'wheel' ? 'wheel-screen' : 'settings-screen'}>
      {screen === 'wheel' ? (
        <RadialWheel
          key={activeLevel ? `${activeLevel.kind}-${activeLevel.entry.id}-${tabPage}-${wheelEpoch}` : `main-${wheelEpoch}`}
          buttons={wheelButtons}
          appearance={settings.appearance}
          submenuTitle={activeLevel?.entry.title}
          tabCount={levelCount}
          countLabel={levelCountLabel}
          busy={busy}
          error={error}
          page={tabPage}
          pageCount={pageCount}
          onSettings={() => void openSettings()}
          onBack={backOneLevel}
          onClose={() => void closeLauncher()}
          onPageChange={setTabPage}
        />
      ) : (
        <div className="settings-shell">
          <header className="settings-header"><div><div className="overline">YOUR SHORTCUT TO EVERYTHING</div><h1>Kreis <small>0.4.0</small></h1><p>Pick a direction. Get back to work.</p></div><button className="icon-button" onClick={() => void closeSettings()} title="Close settings"><X/></button></header>
          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && <div className="alert" onClick={() => setNotice('')}>{notice} <X size={14}/></div>}
          <div className="settings-body">
            <section className="setting-section"><div className="section-title"><h2>Global shortcut</h2><span>Anywhere in Windows</span></div><div className="shortcut-row"><input aria-label="Global shortcut" value={shortcutDraft} onChange={event => setShortcutDraft(event.target.value)} placeholder="Control+Space"/><button className="primary" onClick={() => void saveShortcut()}><Save size={16}/> Apply</button></div><p className="helper">Examples: Control+Space, Control+Alt+K, Alt+Shift+Space. If a shortcut is already claimed, Kreis reports an error and preserves the previous binding.</p></section>
            
            <section className="setting-section">
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
                <span className="sample-label" style={{ fontSize: appearanceDraft.labelSize }}>ChatGPT · Runagaldr</span>
                <span className="sample-center" style={{ fontSize: appearanceDraft.centerSize }}>KREIS</span>
              </div>
              <p className="helper">Uses fonts installed on your PC, with Segoe UI as a fallback. Larger fonts may abbreviate long tab titles; the full title stays in the tooltip.</p>
              <div className="appearance-actions">
                <button className="secondary" onClick={() => setAppearanceDraft(DEFAULT_APPEARANCE)}>Reset preview</button>
                <button className="primary" onClick={() => void saveAppearance()}><Save size={16}/> Apply typography</button>
              </div>
            </section>
            <section className="setting-section">
              <div className="section-title">
                <h2>Shortcuts and groups <span className="count">{rootEntries.length}/12 main · {settings.entries.length} total</span></h2>
                <div className="section-buttons">
                  <button className="secondary" disabled={rootEntries.length >= MAX_ITEMS_PER_WHEEL}
                    onClick={() => { setDraft({ ...DEFAULT_GROUP }); setError(''); }}>
                    <Plus size={16}/> Add group
                  </button>
                  <button className="secondary"
                    disabled={rootEntries.length >= MAX_ITEMS_PER_WHEEL && groupIds.size === 0}
                    onClick={() => {
                      setDraft({ ...DEFAULT_NEW, groupId: rootEntries.length >= MAX_ITEMS_PER_WHEEL
                        ? settings.entries.find(entry => entry.type === 'group')?.id : undefined });
                      setError('');
                    }}>
                    <Plus size={16}/> Add shortcut
                  </button>
                </div>
              </div>
              <p className="helper">Create a group, then edit a shortcut and set its placement to that group. Groups keep the main wheel tidy; browser and desktop-app shortcuts still open their own matching tab/window wheels.</p>
              <div className="entry-list">
                {arrangedEntries.map(entry => {
                  const Icon = icons[entry.icon] || icons.rocket;
                  const siblings = settings.entries.filter(item => (item.groupId || '') === (entry.groupId || ''));
                  const siblingIndex = siblings.findIndex(item => item.id === entry.id);
                  const isGroup = entry.type === 'group';
                  return (
                    <div className={`entry-row${isGroup ? ' entry-row--group' : ''}${entry.groupId ? ' entry-row--child' : ''}`} key={entry.id}>
                      <div className="entry-icon" style={{background: entry.color}}><Icon size={20}/></div>
                      <div className="entry-name">
                        <strong>{entry.title}</strong>
                        <small>{isGroup ? `Group · ${childrenFor(entry.id).length} shortcuts`
                          : entry.type === 'app' ? 'Windows app' : `Vivaldi · ${entry.profile}`}</small>
                      </div>
                      <span className="entry-target" title={entry.target}>
                        {isGroup ? 'Nested Kreis' : entry.target}
                      </span>
                      <div className="entry-actions">
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
            </section>
            <section className="setting-section"><div className="section-title"><h2>Browser connection</h2><button className="secondary" onClick={() => void getProfiles().then(setProfiles)}>Refresh</button></div><div className="profiles"><div>Work <strong className={profiles.includes('Work') ? 'online' : 'offline'}>{profiles.includes('Work') ? 'Connected' : 'Not connected'}</strong></div><div>Personal <strong className={profiles.includes('Personal') ? 'online' : 'offline'}>{profiles.includes('Personal') ? 'Connected' : 'Not connected'}</strong></div></div><label className="helper" htmlFor="pairing-key">Pairing key (paste into each Vivaldi profile's Kreis extension)</label><div className="shortcut-row"><input id="pairing-key" readOnly type="password" value={pairingKey}/><button className="secondary" onClick={() => void navigator.clipboard.writeText(pairingKey)}><Copy size={15}/> Copy</button></div><p className="helper">The extension switches to existing tabs, including tabs in different Vivaldi windows. When disconnected, Kreis opens the URL with your default browser instead.</p></section>
            <div className="bottom-actions"><button className="secondary" onClick={() => void persist({...settings, entries: DEFAULT_SETTINGS.entries})}><RotateCcw size={15}/> Restore sample entries</button><button className="primary" onClick={() => void closeSettings()}><Check size={16}/> Done</button></div>
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
                      placeholder={draft.type === 'group' ? 'IHM' : 'My favorite tab'}/>
                  </label>
                  <label>Type
                    <select value={draft.type} disabled={Boolean(draft.id)}
                      onChange={event => setDraft({...draft, type: event.target.value as Entry['type']})}>
                      <option value="browser">Browser tab</option>
                      <option value="app">Windows application</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                  {draft.type !== 'group' && (
                    <>
                      <label className="wide">{draft.type === 'browser' ? 'Website URL' : 'Executable name or full .exe path'}
                        <input value={draft.target}
                          onChange={event => setDraft({...draft, target: event.target.value})}
                          placeholder={draft.type === 'browser' ? 'https://example.com/' : 'Code.exe'}/>
                      </label>
                      <label className="wide">
                        {draft.type === 'browser' ? 'Tab title contains (optional)' : 'Window title contains (optional)'}
                        <input value={draft.windowTitle || ''}
                          onChange={event => setDraft({...draft, windowTitle: event.target.value})}
                          placeholder={draft.type === 'browser' ? 'For example: IHM' : 'For example: immaculate-heart-of-mary'}/>
                        <small className="helper">
                          {draft.type === 'browser'
                            ? 'Matches both the URL and this text in the tab title (case-insensitive). Leave blank for all matching tabs.'
                            : 'Leave blank to select from all windows. Matching a title focuses only that workspace.'}
                        </small>
                      </label>
                      <label>Placement
                        <select value={draft.groupId || ''}
                          onChange={event => setDraft({...draft, groupId: event.target.value || undefined})}>
                          <option value="">Main Kreis</option>
                          {settings.entries.filter(entry => entry.type === 'group').map(group => (
                            <option key={group.id} value={group.id}>{group.title}</option>
                          ))}
                        </select>
                      </label>
                      {draft.type === 'browser' && (
                        <>
                          <label>Vivaldi profile
                            <select value={draft.profile}
                              onChange={event => setDraft({...draft, profile: event.target.value as Entry['profile']})}>
                              <option>Work</option><option>Personal</option>
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
                  <label>Icon
                    <select value={draft.icon} onChange={event => setDraft({...draft, icon: event.target.value})}>
                      {Object.keys(icons).map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <label>Color
                    <input className="color-input" type="color" value={draft.color}
                      onChange={event => setDraft({...draft, color: event.target.value})}/>
                  </label>
                </div>
                {draft.type === 'group' && <p className="helper">Once saved, edit any shortcut to assign it to this group.</p>}
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
