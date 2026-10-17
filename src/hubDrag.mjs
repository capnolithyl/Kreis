/** Small pointer jitter should still activate the hub's click action. */
export function passedHubDragThreshold(startX, startY, currentX, currentY, threshold = 10) {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}
