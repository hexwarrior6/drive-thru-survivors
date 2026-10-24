import { ROAD_LEFT, ROAD_RIGHT } from '../config';
import { clamp } from '../utils/math';

export const MAIN_ROAD_HALF = (ROAD_RIGHT - ROAD_LEFT) / 2;
// The existing rightmost lane becomes the pit lane; the carriageway never gains a fourth lane.
export const PIT_SIDE = 104;
export const PIT_PLAYER_X = 225 + PIT_SIDE;
export const PIT_CAMERA_SIDE = 80;
export const PIT_ENTRY_SECONDS = 2.8;
export const PIT_EXIT_SECONDS = 2.5;
export const PIT_EXIT_DISTANCE = 420;
export const PIT_LANE_HALF = 44;
export const PIT_DIVIDER_SIDE = 52;
export const PIT_WALL_START = -200;
export const PIT_WALL_END = 150;
export function smoothPit(t: number): number { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
export function pitDividerVisible(relative: number): boolean {
  return relative >= PIT_WALL_START && relative <= PIT_WALL_END;
}
export function pitLaneCenter(_relative: number): number { return PIT_SIDE; }
