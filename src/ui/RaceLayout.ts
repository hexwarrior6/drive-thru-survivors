import type Phaser from 'phaser';
import { CAR_Y, HEIGHT, WIDTH } from '../config';

const mobileQuery = '(max-width: 700px)';
let carY = CAR_Y;

/** Move the existing controls, preserving state and event listeners across resize. */
export function installRaceLayout(game: Phaser.Game): () => void {
  const mobile = matchMedia(mobileQuery);
  const stage = document.getElementById('stage')!;
  const driveUI = document.getElementById('drive-ui')!;
  const charge = document.querySelector<HTMLElement>('.charge-card')!;
  const cruise = document.querySelector<HTMLElement>('.cruise')!;
  const telemetry = document.getElementById('desktop-telemetry')!;
  const settings = document.getElementById('desktop-settings')!;
  const sync = () => {
    if (mobile.matches) {
      driveUI.prepend(charge);
      driveUI.append(cruise);
    } else {
      telemetry.append(charge);
      settings.append(cruise);
    }
    // FIT still controls scaling. Taller phones gain world height, never stretched art.
    const height = mobile.matches
      ? Math.round(WIDTH * stage.clientHeight / Math.max(1, stage.clientWidth))
      : HEIGHT;
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

/** Position the car in the lower third of the usable road, above all touch UI. */
export function getCarY(): number { return carY; }

export function updateCarY(viewHeight: number): void {
  if (!matchMedia(mobileQuery).matches) { carY = viewHeight * 0.68; return; }
  const stage = document.getElementById('game')!.getBoundingClientRect();
  const controls = document.getElementById('drive-ui')!.getBoundingClientRect();
  if (controls.height === 0 || stage.width === 0) { carY = viewHeight * 0.64; return; }
  const controlsTop = (controls.top - stage.top) * WIDTH / stage.width;
  carY = Math.max(120, Math.min(viewHeight * 0.68, controlsTop - 78));
}
