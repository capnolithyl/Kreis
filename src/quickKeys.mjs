/** Keys 1–9 activate slices 1–9; 0 activates the tenth slice.
 * The caller is responsible for ignoring modifier keys and editable fields.
 */
export function quickKeyForIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 10) return null;
  return index === 9 ? '0' : String(index + 1);
}

export function sliceIndexForKey(key, itemCount) {
  if (typeof key !== 'string' || !Number.isInteger(itemCount) || itemCount < 1) return null;
  const index = key === '0' ? 9 : /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  return index >= 0 && index < Math.min(itemCount, 10) ? index : null;
}
