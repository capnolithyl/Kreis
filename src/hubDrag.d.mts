export function passedHubDragThreshold(
  startX: number, startY: number, currentX: number, currentY: number, threshold?: number
): boolean;
export type PhysicalPoint = { x: number; y: number };
export type PhysicalBounds = { width: number; height: number };
export type DisplayBounds = { position: PhysicalPoint; size: PhysicalBounds };
export function clampWindowToMonitors(
  position: PhysicalPoint, size: PhysicalBounds, monitors: DisplayBounds[]
): PhysicalPoint;
