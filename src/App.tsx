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
        const tabs = await getMatchingTabs(entry);
        if (generation !== selectionGeneration.current) return;
        if (tabs && tabs.length > 1) {
          pushLevel({ kind: 'tabs', entry, tabs });
          return;
        }
        if (tabs && tabs.length === 1) {
          await focusBrowserTab(entry.profile, tabs[0].id);
        } else {
          // An old/disconnected extension retains the previous URL fallback.
          const result = await launch(entry);
          if (result.details) setNotice(result.details);
        }
      } else if (entry.type === 'app') {
        const windows = await listAppWindows(entry.target);
        if (generation !== selectionGeneration.current) return;
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

  async function saveEntry() {
    if (!draft) return;
    const problem = validateEntry(draft);
    if (problem) return setError(problem);
    if (!draft.id && settings.entries.length >= 12) return setError('The first wheel supports up to 12 entries.');
    const entry = { ...draft, id: draft.id || crypto.randomUUID(), title: draft.title.trim(), target: draft.target.trim() };
    const entries = draft.id ? settings.entries.map(current => current.id === draft.id ? entry : current) : [...settings.entries, entry];
    try { await persist({ ...settings, entries }); setDraft(null); setError(''); }
    catch (cause) { setError(String(cause)); }
  }

  async function deleteEntry(id: string) {
    try { await persist({ ...settings, entries: settings.entries.filter(entry => entry.id !== id) }); }
    catch (cause) { setError(String(cause)); }
  }

  async function moveEntry(index: number, delta: number) {
    const other = index + delta;
    if (other < 0 || other >= settings.entries.length) return;
    const entries = [...settings.entries];
    [entries[index], entries[other]] = [entries[other], entries[index]];
    try { await persist({ ...settings, entries }); }
    catch (cause) { setError(String(cause)); }
  }

  const pageCount = submenu ? Math.ceil(submenu.tabs.length / tabsPerPage) : 1;
  const visibleTabs = submenu ? submenu.tabs.slice(tabPage * tabsPerPage, (tabPage + 1) * tabsPerPage) : [];
  const wheelButtons: WheelOption[] = submenu
    ? [
        ...visibleTabs.map(tab => ({
          key: `tab-${tab.id}`,
          title: tab.title || 'Untitled tab',
          color: submenu.entry.color,
          icon: submenu.entry.icon,
          tooltip: tab.title || 'Untitled tab',
          onSelect: () => void selectTab(tab)
        })),
        {
          key: 'new-tab',
          title: 'New tab',
          color: '#3b846d',
          icon: 'plus',
          tooltip: `Open a new ${submenu.entry.title} tab`,
          onSelect: () => void openNewTab(),
          isNew: true
        }
      ]
    : settings.entries.map(entry => ({
        key: entry.id, title: entry.title, color: entry.color, icon: entry.icon,
        tooltip: `${entry.title} (${entry.type === 'browser' ? entry.profile : 'Windows'})`,
        onSelect: () => void selectEntry(entry)
      }));

  return (
    <main className={screen === 'wheel' ? 'wheel-screen' : 'settings-screen'}>
      {screen === 'wheel' ? (
        <RadialWheel
          key={submenu ? `sub-${submenu.entry.id}-${tabPage}-${wheelEpoch}` : `main-${wheelEpoch}`}
          buttons={wheelButtons}
          appearance={settings.appearance}
          submenuTitle={submenu?.entry.title}
          tabCount={submenu?.tabs.length}
          busy={busy}
          error={error}
          page={tabPage}
          pageCount={pageCount}
          onSettings={() => void openSettings()}
          onBack={() => { setSubmenu(null); setTabPage(0); setError(''); }}
          onClose={() => void closeLauncher()}
          onPageChange={setTabPage}
        />
      ) : (
        <div className="settings-shell">
          <header className="settings-header"><div><div className="overline">YOUR SHORTCUT TO EVERYTHING</div><h1>Kreis <small>0.3.0</small></h1><p>Pick a direction. Get back to work.</p></div><button className="icon-button" onClick={() => void closeSettings()} title="Close settings"><X/></button></header>
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
            <section className="setting-section"><div className="section-title"><h2>Wheel entries <span className="count">{settings.entries.length}/12</span></h2><button className="secondary" disabled={settings.entries.length >= 12} onClick={() => {setDraft({...DEFAULT_NEW}); setError('');}}><Plus size={16}/> Add entry</button></div>
            <div className="entry-list">{settings.entries.map((entry, index) => { const Icon = icons[entry.icon] || icons.rocket; return (<div className="entry-row" key={entry.id}><div className="entry-icon" style={{background: entry.color}}><Icon size={20}/></div><div className="entry-name"><strong>{entry.title}</strong><small>{entry.type === 'app' ? 'Windows app' : `Vivaldi · ${entry.profile}`}</small></div><span className="entry-target" title={entry.target}>{entry.target}</span><div className="entry-actions"><button className="tiny" aria-label={`Move ${entry.title} up`} disabled={index === 0} onClick={() => void moveEntry(index, -1)}>↑</button><button className="tiny" aria-label={`Move ${entry.title} down`} disabled={index === settings.entries.length - 1} onClick={() => void moveEntry(index, 1)}>↓</button><button className="tiny" onClick={() => {setDraft({...entry});setError('');}}>Edit</button><button className="tiny danger" aria-label={`Delete ${entry.title}`} onClick={() => void deleteEntry(entry.id)}><Trash2 size={15}/></button></div></div>);})}</div>
            </section>
            <section className="setting-section"><div className="section-title"><h2>Browser connection</h2><button className="secondary" onClick={() => void getProfiles().then(setProfiles)}>Refresh</button></div><div className="profiles"><div>Work <strong className={profiles.includes('Work') ? 'online' : 'offline'}>{profiles.includes('Work') ? 'Connected' : 'Not connected'}</strong></div><div>Personal <strong className={profiles.includes('Personal') ? 'online' : 'offline'}>{profiles.includes('Personal') ? 'Connected' : 'Not connected'}</strong></div></div><label className="helper" htmlFor="pairing-key">Pairing key (paste into each Vivaldi profile's Kreis extension)</label><div className="shortcut-row"><input id="pairing-key" readOnly type="password" value={pairingKey}/><button className="secondary" onClick={() => void navigator.clipboard.writeText(pairingKey)}><Copy size={15}/> Copy</button></div><p className="helper">The extension switches to existing tabs, including tabs in different Vivaldi windows. When disconnected, Kreis opens the URL with your default browser instead.</p></section>
            <div className="bottom-actions"><button className="secondary" onClick={() => void persist({...settings, entries: DEFAULT_SETTINGS.entries})}><RotateCcw size={15}/> Restore sample entries</button><button className="primary" onClick={() => void closeSettings()}><Check size={16}/> Done</button></div>
          </div>
          {draft && <div className="dialog-backdrop"><div className="edit-dialog" role="dialog" aria-modal="true" aria-label="Edit wheel entry"><div className="dialog-heading"><h2>{draft.id ? 'Edit entry' : 'Add entry'}</h2><button className="icon-button" onClick={() => setDraft(null)}><X/></button></div><div className="form-grid"><label>Label<input value={draft.title} maxLength={30} onChange={event => setDraft({...draft, title: event.target.value})} placeholder="My favorite tab" /></label><label>Type<select value={draft.type} onChange={event => setDraft({...draft,type: event.target.value as Entry['type']})}><option value="browser">Browser tab</option><option value="app">Windows application</option></select></label><label className="wide">{draft.type === 'browser' ? 'Website URL' : 'Executable name or full .exe path'}<input value={draft.target} onChange={event => setDraft({...draft,target: event.target.value})} placeholder={draft.type === 'browser' ? 'https://example.com/' : 'Code.exe'} /></label>{draft.type === 'browser' && <><label>Vivaldi profile<select value={draft.profile} onChange={event => setDraft({...draft,profile: event.target.value as Entry['profile']})}><option>Work</option><option>Personal</option></select></label><label>Tab matching<select value={draft.match} onChange={event => setDraft({...draft,match: event.target.value as Entry['match']})}><option value="prefix">URL path prefix (subpages too)</option><option value="exact">Exact URL (ignores hash)</option><option value="site">Website excluding /wp-admin/</option></select></label></>}<label>Icon<select value={draft.icon} onChange={event => setDraft({...draft,icon:event.target.value})}>{Object.keys(icons).map(name => <option key={name} value={name}>{name}</option>)}</select></label><label>Color<input className="color-input" type="color" value={draft.color} onChange={event => setDraft({...draft,color:event.target.value})}/></label></div><div className="dialog-actions"><button className="secondary" onClick={() => setDraft(null)}>Cancel</button><button className="primary" onClick={() => void saveEntry()}><Check size={16}/> Save entry</button></div></div></div>}
        </div>
      )}
      {!isReady && !error && <span className="sr-only">Loading Kreis...</span>}
    </main>
  );
}
