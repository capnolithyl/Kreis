/** A pointer must travel far enough before a hub press turns into a window move.
 * Using absolute pointer movement keeps tiny hand jitters behaving as clicks.
 */
export function passedHubDragThreshold(startX, startY, currentX, currentY, threshold = 10) {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}

/** Constrain the entire 600px launcher to one real monitor, accounting for
 * negative desktop coordinates and mixed-resolution monitor arrangements.
 * Inputs and results are all *physical pixels*, matching Tauri's window API.
 */
export function clampWindowToMonitors(position, size, monitors) {
  if (!Array.isArray(monitors) || monitors.length === 0) return position;
  const centerX = position.x + size.width / 2;
  const centerY = position.y + size.height / 2;
  const distanceToMonitor = monitor => {
    const left = monitor.position.x;
    const top = monitor.position.y;
    const right = left + monitor.size.width;
    const bottom = top + monitor.size.height;
    const dx = Math.max(left - centerX, 0, centerX - right);
    const dy = Math.max(top - centerY, 0, centerY - bottom);
    return dx * dx + dy * dy;
  };
  const monitor = monitors.reduce((nearest, candidate) =>
    distanceToMonitor(candidate) < distanceToMonitor(nearest) ? candidate : nearest
  );
  const left = monitor.position.x;
  const top = monitor.position.y;
  const maxX = Math.max(left, left + monitor.size.width - size.width);
  const maxY = Math.max(top, top + monitor.size.height - size.height);
  return {
    x: Math.min(maxX, Math.max(left, position.x)),
    y: Math.min(maxY, Math.max(top, position.y))
  };
}
