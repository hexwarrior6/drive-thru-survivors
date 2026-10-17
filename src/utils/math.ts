export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The angular form of 2D unit-vector slerp, including wraparound. */
export function slerpAngle(from: number, to: number, factor: number): number {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * factor;
}
