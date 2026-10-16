import { ArrowLeft, Plus, Settings2, X } from 'lucide-react';
import { icons } from './icons';
import type { CSSProperties, KeyboardEvent } from 'react';

export type WheelOption = {
  key: string;
  title: string;
  color: string;
  icon: string;
  tooltip: string;
  onSelect: () => void;
  isNew?: boolean;
};

type RadialWheelProps = {
  buttons: WheelOption[];
  submenuTitle?: string;
  tabCount?: number;
  busy: boolean;
  error: string;
  page: number;
  pageCount: number;
  onBack: () => void;
  onSettings: () => void;
  onClose: () => void;
  onPageChange: (page: number) => void;
};

const CENTER = 300;
const OUTER_RADIUS = 249;
const INNER_RADIUS = 108;
const LABEL_RADIUS = 179;
const TWO_PI = 2 * Math.PI;

function point(radius: number, radians: number) {
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius
  };
}

function wedgePath(midpoint: number, count: number): string {
  const half = Math.PI / count;
  const gap = Math.min(0.018, half * 0.12);
  const start = midpoint - half + gap;
  const end = midpoint + half - gap;
  const outerStart = point(OUTER_RADIUS, start);
  const outerEnd = point(OUTER_RADIUS, end);
  const innerEnd = point(INNER_RADIUS, end);
  const innerStart = point(INNER_RADIUS, start);
  const largeArc = end - start > Math.PI ? 1 : 0;

  // Two arcs are required for one-entry wheels: SVG cannot draw a full
  // circle with a single arc whose start and end coordinates are identical.
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ');
}

/** Preserve recognizable beginnings while fitting two concise lines in each wedge. */
function labelLines(label: string, count: number): string[] {
  const max = count >= 10 ? 10 : count >= 8 ? 13 : 17;
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['Untitled'];

  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  if (!lines.length) lines.push(label.slice(0, max));

  const fitted = lines.slice(0, 2).map(line => line.length > max ? line.slice(0, max - 1) + '…' : line);
  const original = words.join(' ');
  if (fitted.join(' ') !== original && fitted.length) {
    const last = fitted.length - 1;
    fitted[last] = fitted[last].slice(0, max - 1).replace(/[\s.,:;-]+$/, '') + '…';
  }
  return fitted;
}

export default function RadialWheel({
  buttons, submenuTitle, tabCount, busy, error, page, pageCount,
  onBack, onSettings, onClose, onPageChange
}: RadialWheelProps) {
  const isSubmenu = Boolean(submenuTitle);

  const activateWithKeyboard = (event: KeyboardEvent<SVGGElement>, action: () => void) => {
    if ((event.key === 'Enter' || event.key === ' ') && !busy) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="wheel" role="menu" aria-label={isSubmenu ? `${submenuTitle} tabs` : 'Kreis launcher'}>
      <div className="wheel-enter">
        <svg className="wheel-svg" viewBox="0 0 600 600" width="600" height="600" aria-label="Radial shortcuts">
          <defs>
            <radialGradient id="kreis-segment-base" cx="50%" cy="40%" r="80%">
              <stop offset="0%" stopColor="#25334b" />
              <stop offset="100%" stopColor="#101825" />
            </radialGradient>
            <radialGradient id="kreis-inner-base" cx="40%" cy="30%" r="85%">
              <stop offset="0%" stopColor="#28354b" />
              <stop offset="100%" stopColor="#101926" />
            </radialGradient>
          </defs>

          <circle className="wheel-ambient" cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 3} />
          {buttons.map((button, index) => {
            const midpoint = -Math.PI / 2 + index * TWO_PI / buttons.length;
            const labelPoint = point(LABEL_RADIUS, midpoint);
            const Icon = button.isNew ? Plus : (icons[button.icon] || icons.rocket);
            const label = labelLines(button.title, buttons.length);
            return (
              <g
                key={button.key}
                role="menuitem"
                tabIndex={busy ? -1 : 0}
                aria-label={button.tooltip}
                aria-disabled={busy}
                className="wheel-segment"
                style={{ '--accent': button.color, '--segment-index': index } as CSSProperties}
                onClick={() => { if (!busy) button.onSelect(); }}
                onKeyDown={event => activateWithKeyboard(event, button.onSelect)}
              >
                <title>{button.tooltip}</title>
                <path d={wedgePath(midpoint, buttons.length)} className="wheel-segment-base" />
                <path d={wedgePath(midpoint, buttons.length)} className="wheel-segment-tint" />
                <g className="wheel-segment-content" pointerEvents="none">
                  <Icon
                    x={labelPoint.x - 13}
                    y={labelPoint.y - 30}
                    width={26}
                    height={26}
                    strokeWidth={1.9}
                    aria-hidden="true"
                    className="wheel-segment-icon"
                  />
                  <text
                    className="wheel-segment-label"
                    x={labelPoint.x}
                    y={labelPoint.y + (label.length === 1 ? 20 : 13)}
                    textAnchor="middle"
                  >
                    {label.map((line, lineIndex) => (
                      <tspan key={lineIndex} x={labelPoint.x} dy={lineIndex === 0 ? 0 : 15}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              </g>
            );
          })}
          <circle
            className="wheel-inner-halo"
            cx={CENTER} cy={CENTER} r={INNER_RADIUS - 3}
            fill="url(#kreis-inner-base)"
            pointerEvents="none"
          />
          <circle
            className="wheel-inner-line"
            cx={CENTER} cy={CENTER} r={INNER_RADIUS - 3}
            pointerEvents="none"
          />
        </svg>
      </div>

      {isSubmenu && (
        <p className="wheel-subheading" title={submenuTitle}>
          {submenuTitle} <span>· {tabCount} tabs</span>
        </p>
      )}

      {isSubmenu ? (
        <button className="wheel-center" type="button" onClick={onBack} disabled={busy} aria-label="Back to main Kreis">
          <ArrowLeft size={28} strokeWidth={1.8} aria-hidden="true" />
          <span className="wheel-center-name">BACK</span>
          <span className="sub-context">{submenuTitle}</span>
        </button>
      ) : (
        <button className="wheel-center" type="button" onClick={onSettings} disabled={busy} aria-label="Open Kreis settings">
          <Settings2 size={26} strokeWidth={1.7} aria-hidden="true" />
          <span className="wheel-center-name">KREIS</span>
          <span className="wheel-center-description">Settings</span>
        </button>
      )}

      {isSubmenu && pageCount > 1 && (
        <div className="wheel-page-controls">
          <button type="button" disabled={busy || page === 0}
            onClick={() => onPageChange(page - 1)} aria-label="Previous tab page">‹ Prev</button>
          <span>{page + 1} / {pageCount}</span>
          <button type="button" disabled={busy || page === pageCount - 1}
            onClick={() => onPageChange(page + 1)} aria-label="Next tab page">Next ›</button>
        </div>
      )}

      <button className="close-wheel" type="button" onClick={onClose} aria-label="Close Kreis">
        <X size={18} aria-hidden="true" />
      </button>
      {busy && <p className="wheel-loading" role="status">Finding your window…</p>}
      {error && <p className="wheel-error" role="alert">{error}</p>}
    </div>
  );
}
