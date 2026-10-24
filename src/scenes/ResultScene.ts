import Phaser from 'phaser';
import { carById } from '../data/cars';
import { weaponNames } from '../combat/weaponMapper';
import { bossName, bossTierOf } from '../systems/balance';
import { recordRun, type HallEntry } from '../systems/SaveSystem';
import type { WeaponType } from '../combat/weaponMapper';

interface RunSummary {
  victory: boolean;
  car: string;
  wave: number;
  distance: number;
  kills: number;
  maxCombo: number;
  money: number;
  slots: ({ name: string; type: WeaponType; level: number } | null)[];
  campaign: string;
  theme: string;
}

/** Final settlement: totals, the six-slot build, local records and one more run. */
export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }
  create(): void {
    document.body.classList.remove('is-driving', 'low-health');
    const panel = document.getElementById('result-panel')!;
    panel.classList.remove('hidden');
    document.getElementById('hud')!.classList.add('hidden');
    document.getElementById('pit-panel')!.classList.add('hidden');
    document.getElementById('drive-ui')!.classList.add('hidden');
    document.getElementById('pause-panel')!.classList.add('hidden');
    const summary = this.registry.get('runSummary') as RunSummary | undefined;
    const car = carById(summary?.car);
    const victory = summary?.victory ?? false;
    document.getElementById('result-tag')!.textContent = victory ? 'ROUTE COMPLETE' : 'ENGINE OFF';
    document.getElementById('result-heading')!.textContent = victory
      ? `第 ${summary!.wave} 波 · ${bossName(bossTierOf(summary!.wave))}击破，路线完成！`
      : `第 ${summary?.wave ?? 1} 波 · 车况耗尽，就地停靠。`;
    const parts = summary?.slots ?? [];
    document.getElementById('result-build')!.replaceChildren(
      ...parts.map(w => {
        const chip = document.createElement('span');
        chip.className = 'result-weapon';
        chip.textContent = w ? `${weaponNames[w.type]} Lv.${w.level}` : '空槽';
        return chip;
      }),
    );
    const set = (id: string, text: string) => { const el = document.getElementById(id)!; el.textContent = text; };
    set('result-car', `${car.name} · ${car.tagline}`);
    set('result-distance', summary ? `${(summary.distance / 1000).toFixed(2)} km` : '0.00 km');
    set('result-kills', String(summary?.kills ?? 0));
    set('result-combo', String(summary?.maxCombo ?? 0));
    set('result-money', String(summary?.money ?? 0));
    // Local hall of records: distance, kills, combo, wave and the last three builds.
    const entry: HallEntry = {
      car: car.id, build: parts.filter(Boolean).map(w => `${weaponNames[w!.type]} Lv.${w!.level}`),
      wave: summary?.wave ?? 1, distance: summary?.distance ?? 0, kills: summary?.kills ?? 0,
      maxCombo: summary?.maxCombo ?? 0, victory, at: new Date().toISOString(),
    };
    const { records, newDistance, newKills, newCombo, newWave } = recordRun(entry);
    const marks: string[] = [];
    if (newDistance) marks.push('最远里程');
    if (newWave) marks.push('最远波次');
    if (newKills) marks.push('最多消灭');
    if (newCombo) marks.push('最高连击');
    const recordNote = document.getElementById('result-records')!;
    recordNote.textContent = marks.length ? `🏆 新纪录 · ${marks.join(' / ')}` : `本地纪录 · 最远 ${(records.bestDistance / 1000).toFixed(2)} km · 最高连击 ${records.bestCombo}`;
    const hall = document.getElementById('result-hall')!;
    hall.replaceChildren(...records.hall.map((item, i) => {
      const row = document.createElement('li');
      const def = carById(item.car);
      row.textContent = `${i + 1}. ${def.name} · 第 ${item.wave} 波 · ${(item.distance / 1000).toFixed(2)} km · 消灭 ${item.kills} · ${item.victory ? '通关' : '抛锚'}`;
      return row;
    }));
    hall.classList.toggle('hidden', records.hall.length === 0);
    const retry = document.getElementById('result-retry') as HTMLButtonElement;
    const home = document.getElementById('result-home') as HTMLButtonElement;
    retry.disabled = home.disabled = false;
    retry.textContent = '换车再来一局 ↗';
    home.textContent = '返回标题';
    retry.onclick = () => { retry.disabled = home.disabled = true; panel.classList.add('hidden'); this.scene.start('Select'); };
    home.onclick = () => { retry.disabled = home.disabled = true; panel.classList.add('hidden'); this.scene.start('Title'); };
  }
}
