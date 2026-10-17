import { useState } from 'react';
import type { BrowserId, BrowserProfile, Entry } from './types';
import { BROWSER_OPTIONS } from './browserProfiles.mjs';

type Props = {
  profiles: BrowserProfile[];
  connected: string[];
  entries: Entry[];
  pairingKey: string;
  onRefresh: () => void;
  onAdd: (name: string, browserId: BrowserId) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, replacementId: string) => void;
};

export default function BrowserProfilesPanel({
  profiles, connected, entries, pairingKey, onRefresh, onAdd, onRename, onDelete
}: Props) {
  const [newName, setNewName] = useState('');
  const [newBrowser, setNewBrowser] = useState<BrowserId>('vivaldi');
  const [renaming, setRenaming] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState('');
  const [replacement, setReplacement] = useState('');
  const deletingProfile = profiles.find(p => p.id === deleting);
  const affected = entries.filter(entry =>
    entry.type === 'browser' && (entry.profileId !== undefined ? entry.profileId : entry.profile) === deleting
  );

  return (
    <section className="setting-section browser-profiles-section">
      <div className="section-title">
        <h2>Browser profiles</h2>
        <button className="secondary" type="button" onClick={onRefresh}>Refresh connections</button>
      </div>
      <p className="helper">Add each browser/profile combination you use, then pair its Kreis extension. Profiles keep stable IDs when renamed. A profile called Work can exist in both Vivaldi and Chrome.</p>
      <div className="profile-create-row">
        <label>Browser
          <select value={newBrowser} onChange={event => setNewBrowser(event.target.value as BrowserId)}>
            {BROWSER_OPTIONS.map(browser => <option key={browser.id} value={browser.id}>{browser.name}</option>)}
          </select>
        </label>
        <label>Profile name
          <input maxLength={48} placeholder="e.g. Work" value={newName} onChange={event => setNewName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && newName.trim()) {
              onAdd(newName, newBrowser); setNewName('');
            } }}/>
        </label>
        <button className="primary" type="button" disabled={!newName.trim() || profiles.length >= 64}
          onClick={() => { onAdd(newName, newBrowser); setNewName(''); }}>Add profile</button>
      </div>

      <div className="browser-profile-list">
        {profiles.length === 0 && <p className="helper">No browser profiles configured. Add one above to get started.</p>}
        {profiles.map(profile => {
          const browser = BROWSER_OPTIONS.find(b => b.id === profile.browserId);
          const used = entries.filter(entry => entry.type === 'browser' &&
            (entry.profileId !== undefined ? entry.profileId : entry.profile) === profile.id).length;
          return <div className="browser-profile-row" key={profile.id}>
            <div className="browser-profile-details">
              {renaming === profile.id ? (
                <div className="browser-profile-rename">
                  <input autoFocus maxLength={48} value={renameValue}
                    onChange={event => setRenameValue(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') {
                      onRename(profile.id, renameValue); setRenaming('');
                    } }}/>
                  <button type="button" className="tiny" onClick={() => { onRename(profile.id, renameValue); setRenaming(''); }}>Save</button>
                  <button type="button" className="tiny" onClick={() => setRenaming('')}>Cancel</button>
                </div>
              ) : <strong>{browser?.name || profile.browserId} · {profile.name}</strong>}
              <small>{used} shortcut{used === 1 ? '' : 's'} · ID: {profile.id}</small>
            </div>
            <span className={connected.includes(profile.id) ? 'online' : 'offline'}>
              {connected.includes(profile.id) ? 'Connected' : 'Not connected'}
            </span>
            <button type="button" className="tiny" onClick={() => {
              setRenaming(profile.id); setRenameValue(profile.name); setDeleting('');
            }}>Rename</button>
            <button type="button" className="tiny danger" onClick={() => {
              setDeleting(profile.id); setReplacement(''); setRenaming('');
            }}>Remove</button>
          </div>;
        })}
      </div>
      {deletingProfile && <div className="profile-delete-confirm" role="group"
        aria-label={`Remove ${deletingProfile.name} profile`}>
        <strong>Remove {deletingProfile.name} from {BROWSER_OPTIONS.find(b => b.id === deletingProfile.browserId)?.name}?</strong>
        <p className="helper">{affected.length} website shortcut{affected.length === 1 ? '' : 's'} currently use this profile. Your shortcuts will not be deleted. Connected extensions using this profile will need to choose another pairing.</p>
        <label>What happens to those shortcuts?
          <select value={replacement} onChange={event => setReplacement(event.target.value)}>
            <option value="">Leave unassigned (choose a profile later)</option>
            {profiles.filter(p => p.id !== deletingProfile.id).map(p => <option key={p.id} value={p.id}>
              Reassign to {BROWSER_OPTIONS.find(b => b.id === p.browserId)?.name} · {p.name}
            </option>)}
          </select>
        </label>
        <div className="profile-delete-actions">
          <button type="button" className="secondary" onClick={() => setDeleting('')}>Cancel</button>
          <button type="button" className="danger" onClick={() => {
            onDelete(deletingProfile.id, replacement); setDeleting('');
          }}>Confirm removal</button>
        </div>
      </div>}
      <div className="browser-connection-help">
        <label className="helper" htmlFor="pairing-key">Pairing key (paste in the extension for each browser profile)</label>
        <div className="shortcut-row">
          <input id="pairing-key" readOnly type="password" value={pairingKey}/>
          <button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(pairingKey)}>Copy key</button>
        </div>
        <p className="helper">Load <code>extension/</code> as an unpacked extension in your Chromium browser's extensions page. Enable Developer mode, paste this key, select the matching configured profile, and connect. Each independent browser profile needs a separate extension installation. You must update the companion to 0.4.0 for new profiles; older Vivaldi Work/Personal extensions still work.</p>
        <p className="helper">To avoid opening a different browser or profile, new disconnected profile shortcuts show an error. Legacy Work/Personal Vivaldi shortcuts preserve their default-browser fallback.</p>
      </div>
    </section>
  );
}
