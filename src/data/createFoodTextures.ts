import type Phaser from 'phaser';
import { FOOD_VARIANTS, FOOD_DATA_URLS } from './foodArt';

/** Bake smooth Canvas curves once. DOM gets 3× art; combat keeps logical texture sizes. */
export function createFoodTextures(scene: Phaser.Scene): void {
  const scale = 3;
  for (const list of Object.values(FOOD_VARIANTS)) {
    for (const variant of list) {
      const art = document.createElement('canvas');
      art.width = variant.w * scale; art.height = variant.h * scale;
      const ctx = art.getContext('2d')!;
      ctx.scale(scale, scale);
      variant.draw(ctx);
      FOOD_DATA_URLS[variant.key] = art.toDataURL();
      // Preserve frame dimensions, bulletScale and every existing sprite consumer.
      const texture = scene.textures.createCanvas(variant.key, variant.w, variant.h)!;
      texture.context.drawImage(art, 0, 0, variant.w, variant.h);
      texture.refresh();
    }
  }
}
