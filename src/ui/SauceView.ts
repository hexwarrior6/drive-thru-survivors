import { SAUCE, SAUCE_DATA_URLS, sauceByKey, sauceOffersFor, type SauceDef } from '../combat/sauces';
import type { CombatSystem } from '../combat/CombatSystem';

/** Baked packet art when available; a tinted placeholder keeps tests headless-honest. */
function packetArt(def: SauceDef): string {
  const url = SAUCE_DATA_URLS[def.key];
  return url ? `<img src="${url}" alt="" draggable="false">`
    : `<i class="packet-fallback" style="background:#${def.tint.toString(16).padStart(6, '0')}"></i>`;
}

/**
 * 酱料 UI（纯 DOM）：进站面板顶部的「酱料架」展示已装备酱料（最多 4 包）；
 * 调味奖励（第 2 波末 + Boss 波进站）时的三选一卡片列出效果、边界与受影响装备。
 */
export class SauceView {
  constructor(private readonly combat: CombatSystem, private readonly changed: () => void) {}
  /** The sauce rack above the shop: one chip per equipped packet, tooltip = effect. */
  renderTray(): void {
    const tray = document.getElementById('sauce-tray')!;
    const owned = this.combat.ownedSauces();
    tray.classList.toggle('hidden', owned.length === 0);
    tray.replaceChildren();
    for (const key of owned) {
      const def = sauceByKey(key)!;
      const chip = document.createElement('span');
      chip.className = 'sauce-chip';
      chip.title = `${def.label} · ${def.effect}`;
      chip.innerHTML = `${packetArt(def)}<b>${def.label}</b>`;
      tray.append(chip);
    }
  }
  /** Offer this reward wave's three packets; `done` fires exactly once after pick/skip. */
  showReward(wave: number, runSeed: number, wallCapable: boolean, done: () => void): void {
    const panel = document.getElementById('sauce-reward')!;
    const offers = sauceOffersFor(runSeed, wave, this.combat.sauceBits, wallCapable);
    if (!offers.length) { done(); return; }
    const cards = document.getElementById('sauce-cards')!;
    cards.replaceChildren();
    const countLabel = ['零', '一', '两', '三'][offers.length] ?? String(offers.length);
    document.getElementById('sauce-reward-title')!.textContent = `窗口递来${countLabel}包酱料！`;
    cards.style.setProperty('--sauce-cols', String(Math.min(offers.length, 3)));
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      panel.classList.add('hidden');
      document.getElementById('pit-panel')!.classList.remove('rewarding');
      this.renderTray();
      this.changed();
      done();
    };
    for (const key of offers) {
      const def = sauceByKey(key)!;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sauce-card';
      card.innerHTML = `${packetArt(def)}<b>${def.label}</b><small>规则组合</small><p>${def.effect}</p><em class="sauce-bound">${def.bound}</em><em class="sauce-targets">受影响：${def.targets}</em>`;
      card.addEventListener('click', () => { this.combat.equipSauce(key); finish(); });
      cards.append(card);
    }
    const skip = document.getElementById('sauce-skip') as HTMLButtonElement;
    skip.textContent = `都不合适 · 拿 ${SAUCE.skipGold} 金币`;
    skip.onclick = () => { this.combat.money += SAUCE.skipGold; finish(); };
    panel.classList.remove('hidden');
    // Shop interactions wait their turn behind the reward; the tray stays visible.
    document.getElementById('pit-panel')!.classList.add('rewarding');
  }
}
