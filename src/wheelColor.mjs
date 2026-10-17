/** Self-contained color math for Kreis's inline picker. No native OS color popup. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function parseHexColor(input) {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return '#' + [...raw].map(char => char + char).join('').toLowerCase();
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? '#' + raw.toLowerCase() : null;
}

export function hexToHsv(hex) {
  const normalized = parseHexColor(hex);
  if (!normalized) return { h: 0, s: 0, v: 0 };
  const [r, g, b] = [1, 3, 5].map(position => parseInt(normalized.slice(position, position + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max * 100, v: max * 100 };
}

export function hsvToHex({ h, s, v }) {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const c = value * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value - c;
  const parts = hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + parts.map(channel => Math.round((channel + m) * 255)
    .toString(16).padStart(2, '0')).join('');
}
