export type HSV = { h: number; s: number; v: number };
export function parseHexColor(input: string): string | null;
export function hexToHsv(hex: string): HSV;
export function hsvToHex(hsv: HSV): string;
