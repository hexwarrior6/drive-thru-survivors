// Palette and geometric motifs adapted from McPitstop/codex-6.1-sol.
export const C = {
  bg: 0xfcf3d9, panel: 0xfff9e8, border: 0x754329, ink: 0x354e3c,
  car: 0xe75239, gold: 0xffcf52, grass: 0xbed994, leaf: 0x6b9d57,
  road: 0x5c6564, lane: 0xe9dfc1, mint: 0xbce4df, blue: 0x70cfff,
  orange: 0xffa13f, purple: 0xc394ff,
} as const;
export const TIER_COLORS = [C.lane, C.blue, C.orange, C.purple] as const;
