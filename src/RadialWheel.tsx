import { ArrowLeft, Clipboard, Copy, FolderInput, Palette, Pencil, Plus, Settings2, Shapes, Trash2, X } from 'lucide-react';
import { icons } from './icons';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { wheelDropIntent } from './groupDragDrop.mjs';
import { passedHubDragThreshold } from './hubDrag.mjs';
import { quickKeyForIndex, sliceIndexForKey } from './quickKeys.mjs';
import { type WheelAppearance, wheelFontStack } from './types';

export type WheelContextAction = 'rename' | 'color' | 'icon' | 'move' | 'duplicate' | 'copy' | 'delete';

export type WheelOption = {
  key: string;
  title: string;
  color: string;
  icon: string;
  tooltip: string;
  onSelect: () => void;
  isNew?: boolean;
  isGroup?: boolean;
};

type RadialWheelProps = {
  buttons: WheelOption[];
  appearance: WheelAppearance;
  submenuTitle?: string;
  tabCount?: number;
  countLabel?: string;
  busy: boolean;
  error: string;
  page: number;
  pageCount: number;
  onBack: () => void;
  onSettings: () => void;
  onHubDrag: () => void;
  keyboardDisabled?: boolean;
  onClose: () => void;
  onPageChange: (page: number) => void;
  allowRearrange?: boolean;
  allowMoveUp?: boolean;
  onDropWedge?: (sourceId: string, targetId: string | null, mode: 'before' | 'after' | 'inside' | 'combine' | 'root') => void;
  onContextAction?: (entryId: string, action: WheelContextAction) => void;
  groupCreation?: { sourceTitle: string; targetTitle: string; name: string } | null;
  onGroupNameChange?: (name: string) => void;
  onConfirmGroup?: () => void;
  onCancelGroup?: () => void;
  feedback?: string;
  canUndo?: boolean;
  onUndo?: () => void;
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
  if (count === 1) {
    // Two semicircles form a complete ring without the invisible seam an SVG
    // single-arc 360-degree path would create.
    const a = midpoint - Math.PI / 2;
    const b = a + Math.PI;
    const outerStart = point(OUTER_RADIUS, a);
    const outerMiddle = point(OUTER_RADIUS, b);
    const innerStart = point(INNER_RADIUS, a);
    const innerMiddle = point(INNER_RADIUS, b);
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerMiddle.x} ${outerMiddle.y}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerStart.x} ${outerStart.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerMiddle.x} ${innerMiddle.y}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
      'Z'
    ].join(' ');
  }
  // No angular gap; adjacent wedges share an edge, creating a seamless ring.
  const start = midpoint - half;
  const end = midpoint + half;
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
function labelLines(label: string, count: number, fontSize: number): string[] {
  const base = count >= 10 ? 10 : count >= 8 ? 13 : 17;
  // Larger fonts need shorter lines to remain inside the wedge.
  const max = Math.max(6, Math.floor(base * 12 / fontSize));
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
  buttons, appearance, submenuTitle, tabCount, countLabel = 'tabs', busy, error, page, pageCount,
  onBack, onSettings, onHubDrag, onClose, onPageChange, keyboardDisabled = false, allowRearrange = false,
  allowMoveUp = false, onDropWedge, onContextAction, groupCreation, onGroupNameChange,
  onConfirmGroup, onCancelGroup, feedback, canUndo, onUndo
}: RadialWheelProps) {
  const isSubmenu = Boolean(submenuTitle);
  const [contextMenu, setContextMenu] = useState<{ entryId: string; x: number; y: number } | null>(null);
  const contextButton = contextMenu ? buttons.find(button => button.key === contextMenu.entryId) : undefined;
  // Catch Escape before the app-level handler that otherwise closes the launcher.
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setContextMenu(null);
      }
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [contextMenu]);

  // Numbers work on the currently displayed Kreis only. A dialog, open context
  // menu, typing field, drag, or modifier combo must never launch a shortcut.
  useEffect(() => {
    if (busy || keyboardDisabled || groupCreation || contextMenu) return;
    const onQuickKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing ||
          event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
          dragRef.current || hubPointer.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest(
        'input, textarea, select, [contenteditable], [role="textbox"], [role="dialog"], .wheel-group-overlay'
      )) return;
      const index = sliceIndexForKey(event.key, buttons.length);
      if (index === null) return;
      event.preventDefault();
      buttons[index].onSelect();
    };
    document.addEventListener('keydown', onQuickKey);
    return () => document.removeEventListener('keydown', onQuickKey);
  }, [buttons, busy, keyboardDisabled, contextMenu, groupCreation]);

  const [dragOver, setDragOver] = useState<{
    sourceId: string; targetId: string | null;
    mode: 'before' | 'after' | 'inside' | 'combine' | 'root';
  } | null>(null);
  const dragRef = useRef<{
    sourceId: string; pointerId: number; startX: number; startY: number;
    moved: boolean; element: SVGGElement;
  } | null>(null);
  const dragOverRef = useRef<{
    sourceId: string; targetId: string | null;
    mode: 'before' | 'after' | 'inside' | 'combine' | 'root';
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const hubPointer = useRef<{ pointerId: number; startX: number; startY: number; element: HTMLButtonElement } | null>(null);
  const suppressHubClick = useRef(false);

  /** Hub drag is intentionally independent of the SVG slice drag gesture. */
  function beginHubPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || busy || groupCreation || contextMenu) return;
    suppressHubClick.current = false;
    hubPointer.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      element: event.currentTarget
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveHubPress(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = hubPointer.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!passedHubDragThreshold(gesture.startX, gesture.startY, event.clientX, event.clientY)) return;
    hubPointer.current = null;
    suppressHubClick.current = true;
    // Release WebView capture before Windows takes over the native window drag.
    if (gesture.element.hasPointerCapture(event.pointerId)) {
      gesture.element.releasePointerCapture(event.pointerId);
    }
    onHubDrag();
  }

  function endHubPress(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = hubPointer.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    hubPointer.current = null;
    if (gesture.element.hasPointerCapture(event.pointerId)) {
      gesture.element.releasePointerCapture(event.pointerId);
    }
  }

  function clickHub(event: ReactMouseEvent<HTMLButtonElement>, action: () => void) {
    // The native drag may still generate a synthetic click after releasing the mouse.
    // Keyboard-driven button clicks have detail === 0 and must always stay usable.
    if (suppressHubClick.current && event.detail !== 0) {
      event.preventDefault();
      suppressHubClick.current = false;
      return;
    }
    action();
  }

  const hubPointerHandlers = {
    onPointerDown: beginHubPress,
    onPointerMove: moveHubPress,
    onPointerUp: endHubPress,
    onPointerCancel: endHubPress
  };

  const canDrag = allowRearrange && !busy && !groupCreation && !contextMenu && buttons.length > 0;

  function coordinate(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * 600 / rect.width,
      y: (event.clientY - rect.top) * 600 / rect.height
    };
  }

  function updateDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 12) return;
      active.moved = true;
    }
    const { x, y } = coordinate(event);
    const intent = wheelDropIntent(x, y, buttons.map(button => button.isGroup ? 'group' : 'shortcut'), allowMoveUp);
    if (!intent || intent.targetIndex === null && intent.mode !== 'root') {
      dragOverRef.current = null;
      setDragOver(null);
      return;
    }
    const targetId = intent.targetIndex === null ? null : buttons[intent.targetIndex].key;
    const next = targetId === active.sourceId ? null : {
      sourceId: active.sourceId,
      targetId,
      mode: intent.mode
    };
    dragOverRef.current = next;
    setDragOver(next);
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.element.hasPointerCapture(event.pointerId)) {
      active.element.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (active.moved) {
      suppressClickUntil.current = Date.now() + 150;
      if (!cancelled && dragOverRef.current && onDropWedge) {
        onDropWedge(active.sourceId, dragOverRef.current.targetId, dragOverRef.current.mode);
      }
    }
    dragOverRef.current = null;
    setDragOver(null);
  }

  function dragHint() {
    if (!dragOver) return '';
    if (dragOver.mode === 'root') return 'Move up one Kreis';
    const title = buttons.find(button => button.key === dragOver.targetId)?.title || 'shortcut';
    if (dragOver.mode === 'inside') return `Move into ${title}`;
    if (dragOver.mode === 'combine') return `Create a group with ${title}`;
    return `Move ${dragOver.mode} ${title}`;
  }

  const activateWithKeyboard = (event: ReactKeyboardEvent<SVGGElement>, action: () => void) => {
    if ((event.key === 'Enter' || event.key === ' ') && !busy) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="wheel" role="menu" aria-label={isSubmenu ? `${submenuTitle} ${countLabel}` : 'Kreis launcher'}
      style={{
        fontFamily: wheelFontStack(appearance.fontFamily),
        '--wheel-label-size': `${appearance.labelSize}px`,
        '--wheel-center-size': `${appearance.centerSize}px`
      } as CSSProperties}>
      <div className="wheel-enter">
        <svg className="wheel-svg" viewBox="0 0 600 600" width="600" height="600" aria-label="Radial shortcuts"
          onContextMenu={event => event.preventDefault()}
          onPointerMove={updateDrag}
          onPointerUp={event => endDrag(event)}
          onPointerCancel={event => endDrag(event, true)}>
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
            const quickKey = quickKeyForIndex(index);
            const keyPoint = point(220, midpoint);
            const label = labelLines(button.title, buttons.length, appearance.labelSize);
            return (
              <g
                key={button.key}
                role="menuitem"
                tabIndex={busy ? -1 : 0}
                aria-label={quickKey ? `Press ${quickKey}: ${button.tooltip}` : button.tooltip}
                aria-disabled={busy || Boolean(groupCreation)}
                className={`wheel-segment${dragOver?.sourceId === button.key ? ' is-drag-source' : ''}${dragOver?.targetId === button.key ? ` is-drop-target is-drop-${dragOver.mode}` : ''}`}
                style={{ '--accent': button.color, '--segment-index': index } as CSSProperties}
                onPointerDown={event => {
                  if (!canDrag || event.button !== 0) return;
                  dragRef.current = {
                    sourceId: button.key, pointerId: event.pointerId,
                    startX: event.clientX, startY: event.clientY, moved: false,
                    element: event.currentTarget
                  };
                  // Capture on the originating wedge, not the whole SVG.
                  // A normal click must still select the original segment.
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onContextMenu={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!allowRearrange || !onContextAction || busy || groupCreation) return;
                  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (!rect) return;
                  const scaleX = 600 / rect.width;
                  const scaleY = 600 / rect.height;
                  const x = (event.clientX - rect.left) * scaleX;
                  const y = (event.clientY - rect.top) * scaleY;
                  // Clamp the 210px-wide, ~330px-high menu inside the transparent Tauri window.
                  setContextMenu({ entryId: button.key, x: Math.max(8, Math.min(382, x)),
                    y: Math.max(8, Math.min(258, y)) });
                }}
                onClick={() => {
                  if (contextMenu || Date.now() < suppressClickUntil.current) return;
                  if (!busy && !groupCreation) button.onSelect();
                }}
                onKeyDown={event => {
                  if (allowRearrange && onContextAction && !busy && !groupCreation &&
                      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
                    event.preventDefault();
                    const x = Math.max(8, Math.min(382, labelPoint.x));
                    const y = Math.max(8, Math.min(258, labelPoint.y));
                    setContextMenu({ entryId: button.key, x, y });
                  } else if (!groupCreation && !contextMenu) {
                    activateWithKeyboard(event, button.onSelect);
                  }
                }}
              >
                <title>{quickKey ? `${quickKey} · ${button.tooltip}` : button.tooltip}</title>
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
                      <tspan key={lineIndex} x={labelPoint.x} dy={lineIndex === 0 ? 0 : Math.round(appearance.labelSize * 1.25)}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {quickKey && (
                    <g className="wheel-quick-key" aria-hidden="true">
                      <circle cx={keyPoint.x} cy={keyPoint.y} r={12} className="wheel-quick-key-circle" />
                      <text x={keyPoint.x} y={keyPoint.y} className="wheel-quick-key-number"
                        textAnchor="middle" dominantBaseline="central">{quickKey}</text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
          {dragOver?.mode === 'root' && (
            <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 8} className="wheel-center-drop-ring"
              pointerEvents="none"/>
          )}
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
          {submenuTitle} <span>· {tabCount} {countLabel}</span>
        </p>
      )}

      {isSubmenu ? (
        <button className="wheel-center" type="button" {...hubPointerHandlers}
          onClick={event => clickHub(event, onBack)} disabled={busy}
          aria-label="Back to parent Kreis, or drag the hub to move Kreis">
          <ArrowLeft size={28} strokeWidth={1.8} aria-hidden="true" />
          <span className="wheel-center-name">BACK</span>
          <span className="sub-context">{submenuTitle}</span>
          <span className="wheel-hub-hint" aria-hidden="true">Drag to move</span>
        </button>
      ) : (
        <button className="wheel-center" type="button" {...hubPointerHandlers}
          onClick={event => clickHub(event, onSettings)} disabled={busy}
          aria-label="Open Kreis settings, or drag the hub to move Kreis">
          <Settings2 size={26} strokeWidth={1.7} aria-hidden="true" />
          <span className="wheel-center-name">KREIS</span>
          <span className="wheel-center-description">Settings</span>
          <span className="wheel-hub-hint" aria-hidden="true">Drag to move</span>
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
      {dragOver && <p className="wheel-drag-intent" role="status">{dragHint()}</p>}
      {!dragOver && !feedback && canDrag && buttons.length > 1 && (
        <p className="wheel-drag-help">Drag near edges to reorder · Center to group</p>
      )}
      {feedback && !dragOver && (
        <div className="wheel-change-toast" role="status">
          <span>{feedback}</span>
          {canUndo && <button type="button" onClick={onUndo}>Undo</button>}
        </div>
      )}
      {contextMenu && contextButton && onContextAction && (
        <>
          <button type="button" className="wheel-context-dismiss"
            onClick={() => setContextMenu(null)} aria-label="Dismiss shortcut context menu"/>
          <div className="wheel-context-menu" role="menu"
            aria-label={`Actions for ${contextButton.title}`}
            style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="wheel-context-title" title={contextButton.title}>{contextButton.title}</div>
            {([
              ['rename', 'Rename', Pencil],
              ['color', 'Change color', Palette],
              ['icon', 'Change icon', Shapes],
              ['move', 'Move to group', FolderInput],
              ...(!contextButton.isGroup ? [
                ['duplicate', 'Duplicate', Copy],
                ['copy', 'Copy target', Clipboard]
              ] : []),
              ['delete', contextButton.isGroup ? 'Delete group' : 'Delete shortcut', Trash2]
            ] as [WheelContextAction, string, typeof Pencil][]).map(([action, label, Icon]) => (
              <button type="button" key={action} role="menuitem"
                className={action === 'delete' ? 'is-danger' : ''}
                onClick={() => {
                  setContextMenu(null);
                  onContextAction(contextMenu.entryId, action);
                }}>
                <Icon size={15} aria-hidden="true"/>{label}
              </button>
            ))}
          </div>
        </>
      )}
      {groupCreation && (
        <div className="wheel-group-overlay">
          <form className="wheel-group-form" onSubmit={event => { event.preventDefault(); onConfirmGroup?.(); }}>
            <strong>Create a group</strong>
            <span>{groupCreation.targetTitle} + {groupCreation.sourceTitle}</span>
            <label htmlFor="wheel-group-name">Group name</label>
            <input id="wheel-group-name" type="text" maxLength={30} autoFocus
              value={groupCreation.name} onChange={event => onGroupNameChange?.(event.target.value)}/>
            <div className="wheel-group-actions">
              <button type="button" onClick={onCancelGroup}>Cancel</button>
              <button type="submit" disabled={!groupCreation.name.trim() || busy}>Create</button>
            </div>
          </form>
        </div>
      )}
      {busy && <p className="wheel-loading" role="status">Saving your Kreis…</p>}
      {error && <p className="wheel-error" role="alert">{error}</p>}
    </div>
  );
}
