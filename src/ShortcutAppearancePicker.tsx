import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { icons } from './icons';

const availableIcons = Object.entries(icons).sort(([a], [b]) => a.localeCompare(b));

type PickerProps = {
  value: string;
  onChange: (next: string) => void;
};

export function IconPicker({ value, onChange, color }: PickerProps & { color: string }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const SelectedIcon = icons[value] || icons.rocket;
  const filtered = useMemo(
    () => availableIcons.filter(([name]) => name.toLowerCase().includes(search.trim().toLowerCase())),
    [search]
  );

  return (
    <div className="appearance-field wide">
      <span className="appearance-label" id="shortcut-icon-label">Icon</span>
      <button type="button" className="icon-picker-trigger"
        aria-labelledby="shortcut-icon-label"
        aria-expanded={expanded} aria-controls="shortcut-icon-gallery"
        onClick={() => setExpanded(open => !open)}>
        <span className="icon-picker-preview" style={{ backgroundColor: color }}>
          <SelectedIcon size={24} strokeWidth={2}/>
        </span>
        <span className="icon-picker-trigger-text">
          <strong>{value}</strong>
          <small>Choose from {availableIcons.length} icons</small>
        </span>
        <ChevronDown size={18} className={expanded ? 'icon-picker-chevron is-open' : 'icon-picker-chevron'}/>
      </button>
      {expanded && (
        <div className="icon-picker-gallery" id="shortcut-icon-gallery">
          <div className="icon-picker-search">
            <Search size={16} aria-hidden="true"/>
            <input type="search" aria-label="Search icons" value={search}
              placeholder="Search icons..."
              onChange={event => setSearch(event.target.value)}/>
          </div>
          {filtered.length > 0 ? (
            <div className="icon-picker-grid" aria-label="Available shortcut icons">
              {filtered.map(([name, Icon]) => (
                <button type="button" key={name}
                  className={`icon-picker-option${name === value ? ' is-selected' : ''}`}
                  aria-label={`Use ${name} icon`} aria-pressed={name === value}
                  title={name}
                  onClick={() => { onChange(name); setExpanded(false); setSearch(''); }}>
                  <Icon size={23} strokeWidth={1.9} aria-hidden="true"/>
                  <span>{name}</span>
                </button>
              ))}
            </div>
          ) : <p className="icon-picker-empty">No icons match “{search}”.</p>}
        </div>
      )}
    </div>
  );
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_COLOR = /^#[0-9a-fA-F]{3}$/;

/** Normalize the stored color without overwriting a valid shortcut color. */
export function normalizeShortcutColor(value: string): string {
  if (HEX_COLOR.test(value)) return value.toLowerCase();
  if (SHORT_HEX_COLOR.test(value)) {
    return '#' + value.slice(1).split('').map(character => character + character).join('').toLowerCase();
  }
  return '#6385d7';
}

export function ColorPicker({ value, onChange }: PickerProps) {
  const current = normalizeShortcutColor(value);
  const [hexDraft, setHexDraft] = useState(current);

  // Changing shortcuts re-syncs the input without modifying their saved color.
  useEffect(() => { setHexDraft(current); }, [current]);

  function editHex(next: string) {
    setHexDraft(next);
    const candidate = next.trim().startsWith('#') ? next.trim() : '#' + next.trim();
    if (HEX_COLOR.test(candidate) || SHORT_HEX_COLOR.test(candidate)) {
      onChange(normalizeShortcutColor(candidate));
    }
  }

  return (
    <div className="appearance-field wide">
      <span className="appearance-label" id="shortcut-color-label">Color</span>
      <div className="color-picker-layout">
        <label className="color-picker-swatch" style={{ backgroundColor: current }}
          title="Click to choose a color">
          <span className="color-picker-choose">Choose color</span>
          <input type="color" aria-labelledby="shortcut-color-label"
            value={current} onChange={event => onChange(event.target.value)}/>
        </label>
        <div className="color-picker-details">
          <label htmlFor="shortcut-color-hex">Hex color</label>
          <input id="shortcut-color-hex" type="text" spellCheck={false}
            value={hexDraft} maxLength={7} placeholder="#6385d7"
            aria-invalid={hexDraft.trim() !== current && !HEX_COLOR.test(hexDraft.trim()) && !SHORT_HEX_COLOR.test(hexDraft.trim())}
            onChange={event => editHex(event.target.value)}
            onBlur={() => setHexDraft(current)}/>
          <span className="color-picker-hint">Pick a color or enter its hex code.</span>
        </div>
        <div className="color-picker-live-preview" title="Shortcut preview">
          <div className="color-picker-mini-wheel" style={{ backgroundColor: current }}>
            <span className="color-picker-mini-wheel-inner"/>
          </div>
          <small>Wheel color</small>
        </div>
      </div>
    </div>
  );
}
