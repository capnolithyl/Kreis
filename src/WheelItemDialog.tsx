import { useState, type FormEvent } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { ColorPicker, IconPicker } from './ShortcutAppearancePicker';
import { eligibleParentGroups, getChildren } from './groupHierarchy.mjs';
import type { Entry } from './types';

export type WheelEditMode = 'rename' | 'color' | 'icon' | 'move' | 'details' | 'delete';

type Props = {
  entry: Entry;
  entries: Entry[];
  mode: WheelEditMode;
  busy: boolean;
  error: string;
  onSave: (value: Entry) => void;
  onDelete: () => void;
  onClose: () => void;
};

const titles: Record<WheelEditMode, string> = {
  rename: 'Rename shortcut',
  color: 'Change wheel color',
  icon: 'Change shortcut icon',
  move: 'Move to another Kreis',
  details: 'Edit shortcut',
  delete: 'Delete shortcut'
};

export default function WheelItemDialog({
  entry, entries, mode, busy, error, onSave, onDelete, onClose
}: Props) {
  // The parent keys the editor by ID and mode, so unsaved edits never leak to another entry.
  const [draft, setDraft] = useState<Entry>({ ...entry });
  const children = entry.type === 'group' ? getChildren(entries, entry.id) : [];
  const placements = eligibleParentGroups(entries, entry.id);
  const title = mode === 'delete' && entry.type === 'group'
    ? 'Delete group' : titles[mode];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === 'delete') onDelete();
    else onSave(draft);
  }

  return (
    <div className="wheel-item-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="wheel-item-dialog" role="dialog" aria-modal="true"
        aria-label={title} onSubmit={submit}>
        <div className="wheel-item-dialog-heading">
          <div>
            <small>SHORTCUT ACTIONS</small>
            <h2>{title}</h2>
            <p title={entry.title}>{entry.title}</p>
          </div>
          <button type="button" className="wheel-item-close" onClick={onClose} aria-label="Cancel">
            <X size={17}/>
          </button>
        </div>

        {(mode === 'rename' || mode === 'details') && (
          <label className="wheel-item-field">
            Name
            <input type="text" maxLength={30} autoFocus required value={draft.title}
              onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}/>
          </label>
        )}
        {(mode === 'color' || mode === 'details') && (
          <div className="wheel-item-pickers">
            <ColorPicker value={draft.color}
              onChange={color => setDraft(current => ({ ...current, color }))}/>
          </div>
        )}
        {(mode === 'icon' || mode === 'details') && (
          <div className="wheel-item-pickers">
            <IconPicker value={draft.icon} color={draft.color}
              onChange={icon => setDraft(current => ({ ...current, icon }))}/>
          </div>
        )}
        {mode === 'details' && entry.type !== 'group' && (
          <>
            <label className="wheel-item-field">
              {entry.type === 'browser' ? 'Website URL' : entry.type === 'folder' ? 'Folder path' : 'Executable or shortcut'}
              <input type="text" value={draft.target} required
                onChange={event => setDraft(current => ({ ...current, target: event.target.value }))}/>
            </label>
            {entry.type !== 'folder' && (
              <label className="wheel-item-field">
                {entry.type === 'browser' ? 'Tab title contains (optional)' : 'Window title contains (optional)'}
                <input type="text" value={draft.windowTitle || ''}
                  onChange={event => setDraft(current => ({ ...current, windowTitle: event.target.value }))}/>
              </label>
            )}
            {entry.type === 'browser' && (
              <div className="wheel-item-two-fields">
                <label className="wheel-item-field">
                  Vivaldi profile
                  <select value={draft.profile}
                    onChange={event => setDraft(current => ({ ...current, profile: event.target.value as Entry['profile'] }))}>
                    <option value="Work">Work</option><option value="Personal">Personal</option>
                  </select>
                </label>
                <label className="wheel-item-field">
                  URL matching
                  <select value={draft.match}
                    onChange={event => setDraft(current => ({ ...current, match: event.target.value as Entry['match'] }))}>
                    <option value="exact">Exact URL</option>
                    <option value="prefix">Path prefix</option>
                    <option value="site">Whole site</option>
                  </select>
                </label>
              </div>
            )}
          </>
        )}
        {(mode === 'move' || mode === 'details') && (
          <label className="wheel-item-field">
            Destination
            <select value={draft.groupId || ''}
              onChange={event => setDraft(current => ({ ...current, groupId: event.target.value || undefined }))}>
              <option value="" disabled={entry.groupId !== undefined && getChildren(entries).length >= 12}>
                Main Kreis{getChildren(entries).length >= 12 && entry.groupId ? ' (full)' : ''}
              </option>
              {placements.map(({ id, title: groupTitle, depth }) => {
                const full = getChildren(entries, id).length >= 12 && entry.groupId !== id;
                return <option key={id} value={id} disabled={full}>
                  {`${'　'.repeat(depth)}↳ ${groupTitle}${full ? ' (full)' : ''}`}
                </option>;
              })}
            </select>
          </label>
        )}
        {mode === 'delete' && (
          <div className="wheel-item-warning">
            {entry.type === 'group'
              ? <>Delete <strong>{entry.title}</strong>? Its {children.length} direct item{children.length === 1 ? '' : 's'} will move up to its parent Kreis. Nested groups and shortcuts are kept.</>
              : <>Remove <strong>{entry.title}</strong> from Kreis? This does not delete the application, folder, or website itself.</>}
          </div>
        )}

        {error && <p className="wheel-item-error" role="alert">{error}</p>}
        <div className="wheel-item-dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={mode === 'delete' ? 'wheel-item-danger-button' : 'primary'}
            disabled={busy || (mode !== 'delete' && !draft.title.trim())}>
            {mode === 'delete' ? <Trash2 size={15}/> : <Check size={15}/>}
            {mode === 'delete' ? 'Delete' : mode === 'move' ? 'Move' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
