import type Phaser from 'phaser';
import { FOOD_VARIANTS, FOOD_DATA_URLS } from './foodArt';

/**
 * Boot 阶段把 foodArt 的全部变体烘成贴图（generateTexture 一次、运行时零栅格化），
 * 同时把每张贴图导出为 dataURL 写回 FOOD_DATA_URLS，供 DOM 商店使用——商店卡片、
 * 武器槽与游戏内弹幕同图，观感完全一致（测试环境无 Phaser，该映射保持为空，
 * ShopView 自行回落到内置 SVG）。
 */

export function createFoodTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  for (const list of Object.values(FOOD_VARIANTS)) {
    for (const variant of list) {
      variant.draw(g);
      g.generateTexture(variant.key, variant.w, variant.h);
      g.clear();
    }
  }
  g.destroy();
  for (const list of Object.values(FOOD_VARIANTS)) {
    for (const variant of list) {
      const source = scene.textures.get(variant.key).getSourceImage() as HTMLCanvasElement;
      if (typeof source.toDataURL === 'function') FOOD_DATA_URLS[variant.key] = source.toDataURL();
    }
  }
}
