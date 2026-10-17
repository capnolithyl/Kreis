import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { hexToHsv, hsvToHex, parseHexColor, type HSV } from './wheelColor.mjs';

const presets = [
  '#6385d7', '#438ba8', '#47a66a', '#c1a062', '#d98c45', '#c75b83',
  '#bd69c6', '#697ce5', '#6a8ec2', '#db6470', '#8dabb7', '#353f5a'
];

/** An embedded color picker with no Chromium/Windows popup to re-open on click-through. */
export default function WheelColorPicker({ value, onChange }: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const pointer = useRef<number | null>(null);
  const invalidHex = hexDraft.trim().length > 0 && !parseHexColor(hexDraft);

  function chooseColor(color: string) {
    const normalized = parseHexColor(color);
    if (!normalized) return;
    setHsv(hexToHsv(normalized));
    setHexDraft(normalized.toUpperCase());
    onChange(normalized);
  }

  function chooseHsv(next: HSV) {
    const color = hsvToHex(next);
    setHsv(next);
    setHexDraft(color.toUpperCase());
    onChange(color);
  }

  function chooseAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = Math.min(100, Math.max(0, (event.clientX - rect.left) / rect.width * 100));
    const v = Math.min(100, Math.max(0, 100 - (event.clientY - rect.top) / rect.height * 100));
    chooseHsv({ ...hsv, s, v });
  }

  function keyboardShade(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    let next = hsv;
    if (event.key === 'ArrowLeft') next = { ...hsv, s: Math.max(0, hsv.s - step) };
    else if (event.key === 'ArrowRight') next = { ...hsv, s: Math.min(100, hsv.s + step) };
    else if (event.key === 'ArrowUp') next = { ...hsv, v: Math.min(100, hsv.v + step) };
    else if (event.key === 'ArrowDown') next = { ...hsv, v: Math.max(0, hsv.v - step) };
    else return;
    event.preventDefault();
    chooseHsv(next);
  }

  return (
    <div className="wheel-inline-color">
      <div className="wheel-inline-color-head">
        <span>Choose a shade</span>
        <span className="wheel-inline-color-preview" style={{ backgroundColor: value }} aria-label={`Selected color ${value}`}/>
      </div>
      <div className="wheel-inline-color-shade"
        role="group" tabIndex={0}
        aria-label="Color saturation and brightness. Use arrow keys or drag to adjust."
        style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          chooseAt(event);
        }}
        onPointerMove={event => {
          if (pointer.current === event.pointerId) chooseAt(event);
        }}
        onPointerUp={event => {
          if (pointer.current !== event.pointerId) return;
          chooseAt(event);
          pointer.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={event => {
          if (pointer.current === event.pointerId) pointer.current = null;
        }}
        onKeyDown={keyboardShade}>
        <div className="wheel-inline-color-shade-white"/>
        <div className="wheel-inline-color-shade-black"/>
        <span className="wheel-inline-color-shade-thumb" style={{
          left: `${hsv.s}%`, top: `${100 - hsv.v}%`,
          backgroundColor: hsvToHex(hsv)
        }}/>
      </div>
      <label className="wheel-inline-color-hue-label">
        Hue
        <input type="range" min={0} max={359} value={Math.round(hsv.h)}
          aria-label="Color hue" onChange={event => chooseHsv({ ...hsv, h: Number(event.target.value) })}/>
      </label>
      <div className="wheel-inline-color-presets" role="group" aria-label="Preset colors">
        {presets.map(color => (
          <button key={color} type="button"
            className={value.toLowerCase() === color ? 'is-selected' : ''}
            aria-label={`Use ${color}`} aria-pressed={value.toLowerCase() === color}
            title={color} style={{ backgroundColor: color }}
            onClick={() => chooseColor(color)}/>
        ))}
      </div>
      <label className="wheel-inline-color-hex-label">
        Hex color
        <input type="text" value={hexDraft} maxLength={7}
          aria-label="Hex color" aria-invalid={invalidHex} spellCheck={false}
          onChange={event => {
            const input = event.target.value;
            setHexDraft(input);
            const parsed = parseHexColor(input);
            if (parsed) {
              setHsv(hexToHsv(parsed));
              onChange(parsed);
            }
          }}
          onBlur={() => {
            const parsed = parseHexColor(hexDraft);
            if (parsed) chooseColor(parsed);
            else setHexDraft(value.toUpperCase());
          }}/>
      </label>
      <p className="wheel-inline-color-help">Pick a shade, use a preset, or enter a hex code. Click Save changes to apply it.</p>
    </div>
  );
}
