/** Filter title-bearing results without losing their original tab/window IDs. */
export function filterByTitle<T extends { title: string }>(
  items: T[],
  substring?: string
): T[];
