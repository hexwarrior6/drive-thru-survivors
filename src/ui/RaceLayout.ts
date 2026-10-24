import type Phaser from 'phaser';
import { CAR_Y, HEIGHT, MAX_VIEW_RATIO, MIN_VIEW_RATIO, WIDTH } from '../config';
import { clamp } from '../utils/math';

const mobileQuery = '(max-width: 700px)';
let carY = CAR_Y;

/** Keep the playable world fitted to the HUD and the available viewport. */
export function installRaceLayout(game: Phaser.Game): () => void {
  const mobile = matchMedia(mobileQuery);
  const stage = document.getElementById('stage')!;
  const sync = () => {
    // FIT still controls scaling. The world ratio floats between fixed bounds and
    // letterboxes beyond them, so extreme screens never stretch the playable view.
    const ratio = clamp(stage.clientHeight / Math.max(1, stage.clientWidth), MIN_VIEW_RATIO, MAX_VIEW_RATIO);
    const height = mobile.matches ? Math.round(WIDTH * ratio) : HEIGHT;
    if (height > 0 && game.scale.height !== height) game.scale.setGameSize(WIDTH, height);
    game.scale.refresh();
    updateCarY(height);
  };
  const observer = new ResizeObserver(sync);
  observer.observe(stage);
  mobile.addEventListener('change', sync);
  sync();
  return () => { observer.disconnect(); mobile.removeEventListener('change', sync); };
}

/** Keep a visible pursuit lane behind the car and above the touch UI. */
export function getCarY(): number { return carY; }

export function updateCarY(viewHeight: number): void {
  if (!matchMedia(mobileQuery).matches) { carY = viewHeight * 0.52; return; }
  // Letterboxing can center the canvas inside #game, so measure the canvas itself.
  const view = (document.querySelector('#game canvas') ?? document.getElementById('game')!).getBoundingClientRect();
  const controls = document.getElementById('drive-ui')!.getBoundingClientRect();
  if (controls.height === 0 || view.width === 0) { carY = viewHeight * 0.52; return; }
  const controlsTop = (controls.top - view.top) * WIDTH / view.width;
  carY = Math.max(120, Math.min(viewHeight * 0.51, controlsTop - 210));
}
