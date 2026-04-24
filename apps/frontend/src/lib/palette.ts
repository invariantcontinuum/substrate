const PALETTE = [
  "#5ccdff", "#a0f0c0", "#ffd197", "#ffaaaa", "#d6b577",
  "#c39b54", "#7a9cc6", "#b8a0d9", "#7ec4a0", "#e07070",
  "#5cb8d9", "#d9a05c", "#8a9ec7", "#c77ec7", "#7ec7a0",
];

export function communityPaletteHex(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0];
}
