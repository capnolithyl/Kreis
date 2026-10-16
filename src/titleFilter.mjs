/** Return entries whose browser-provided title includes a case-insensitive substring.
 * URL and Vivaldi profile filtering happen before this function is called.
 * An empty filter deliberately preserves the existing all-tabs behavior.
 */
export function filterByTitle(items, substring) {
  const needle = (substring || '').trim().toLocaleLowerCase();
  if (!needle) return items;
  return items.filter(item => (item.title || '').toLocaleLowerCase().includes(needle));
}
