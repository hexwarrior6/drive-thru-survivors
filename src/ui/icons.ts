/** Flat two-tone mini icons drawn in the game palette; never platform emoji. */
export type StatIcon =
  | 'burst' | 'clock' | 'pierce' | 'fan' | 'snow' | 'boom' | 'flame'
  | 'gauge' | 'bolt' | 'heart' | 'shield' | 'magnet' | 'drain' | 'up' | 'coin' | 'orbit';

const paths: Record<StatIcon, string> = {
  burst: '<path fill="#e75239" d="M12 1.5l1.8 5.6 5.3-2.6-2.6 5.3 5.6 1.8-5.6 1.8 2.6 5.3-5.3-2.6-1.8 5.6-1.8-5.6-5.3 2.6 2.6-5.3L1.5 12l5.6-1.8-2.6-5.3 5.3 2.6Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="#647663" stroke-width="2.4"/><path stroke="#647663" stroke-width="2.4" stroke-linecap="round" fill="none" d="M12 7.5V12l3 2"/>',
  pierce: '<path fill="#b75d36" d="M3.5 10.5h11.2l-3.3-3.3L13.6 5l6.9 7-6.9 7-2.2-2.2 3.3-3.3H3.5Z"/>',
  fan: '<g stroke="#b75d36" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M12 20V6"/><path d="M12 20 5.5 7"/><path d="m12 20 6.5-13"/></g>',
  snow: '<g stroke="#70cfff" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M12 3v18"/><path d="m4.2 7.5 15.6 9"/><path d="m4.2 16.5 15.6-9"/></g>',
  boom: '<circle cx="12" cy="14" r="5.5" fill="#ffa13f"/><path stroke="#e75239" stroke-width="2.4" stroke-linecap="round" d="M12 3.5v4M5 6.5 7.6 9M19 6.5 16.4 9M3 14h3.5M21 14h-3.5"/>',
  flame: '<path fill="#ffa13f" d="M12 2c.8 3.6 5.6 5.4 5.6 11a5.6 5.6 0 0 1-11.2 0C6.4 8.8 11.2 7 12 2Z"/>',
  gauge: '<path fill="none" stroke="#354e3c" stroke-width="2.4" d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path stroke="#e75239" stroke-width="2.4" stroke-linecap="round" d="m12 16.5 3.8-5.5"/>',
  bolt: '<path fill="#ffcf52" d="M13.5 2 5.5 13.5H11L9.5 22 18.5 9.5H12.5L13.5 2Z"/>',
  heart: '<path fill="#e75239" d="M12 21C6 16 3 12.5 3 8.8 3 6 5 4 7.6 4c1.8 0 3.4 1 4.4 2.6C13 5 14.6 4 16.4 4 19 4 21 6 21 8.8c0 3.7-3 7.2-9 12.2Z"/>',
  shield: '<path fill="#70cfff" d="M12 2 4.5 4.8V11c0 5 3.1 8.3 7.5 10.7C16.4 19.3 19.5 16 19.5 11V4.8Z"/>',
  magnet: '<path fill="#e75239" d="M4 3h6v8a2 2 0 0 0 4 0V3h6v8a8 8 0 0 1-16 0Z"/><path fill="#fff9e8" d="M4 3h6v4H4Zm10 0h6v4h-6Z"/>',
  drain: '<path fill="#bd4735" d="M12 22 5 13.5h4.5V3h5v10.5H19Z"/>',
  up: '<path fill="#8bbf57" d="M12 2 19 10.5h-4.5V21h-5V10.5H5Z"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="#ffcf52" stroke="#c49a3e" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#c49a3e" stroke-width="2"/>',
  orbit: '<circle cx="12" cy="12" r="8" fill="none" stroke="#bce4df" stroke-width="2.2" stroke-dasharray="3.5 4"/><circle cx="12" cy="4" r="3.4" fill="#fff9e8" stroke="#754329" stroke-width="1.6"/>',
};

export function statIcon(name: StatIcon, size = 10): string {
  return `<svg class="stat-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

/** Vehicle-module art for the shop service list and installed slots. */
const modulePaths: Record<string, string> = {
  'M-drift': '<circle cx="10.5" cy="12.5" r="7.3" fill="#ffcf52" stroke="#754329" stroke-width="1.6"/><path fill="none" stroke="#ad4931" stroke-width="1.8" stroke-linecap="round" d="M10.5 12.5c2.7 0 3.1-4.1 0-4.1s-4.4 2.3-4.4 4.4 2.5 4.4 4.9 4.4 4.9-2 4.9-4.9"/><circle cx="10.5" cy="12.5" r="1.5" fill="#754329"/><path stroke="#e75239" stroke-width="1.8" stroke-linecap="round" d="M19 5h3M18 9h2"/>',
  'M-bumper': '<path fill="#70cfff" stroke="#754329" stroke-width="1.6" d="M3.5 6.5h17v5h-17z"/><path fill="none" stroke="#754329" stroke-width="1.6" d="M6.5 11.5v6M17.5 11.5v6"/><path stroke="#e75239" stroke-width="1.8" stroke-linecap="round" d="M8.5 14.5h7"/><path fill="#754329" d="M5.5 17.5h2v2h-2zm11 0h2v2h-2z"/>',
  'M-pump': '<rect x="4.5" y="4.5" width="10" height="15" rx="2.2" fill="#8bbf57" stroke="#754329" stroke-width="1.6"/><rect x="6.8" y="7" width="5.4" height="3.2" rx="0.8" fill="#fff9e8" stroke="#754329" stroke-width="1"/><path fill="none" stroke="#754329" stroke-width="1.5" stroke-linecap="round" d="M14.5 8.5h2.2a1.6 1.6 0 0 1 1.6 1.6V17a1.8 1.8 0 0 1-1.8 1.8h-2.2"/><path fill="#e75239" d="M7.5 12.2h3.6v1.6H7.5zm1 0h1.6v3.6H8.5z"/>',
};

export function moduleIcon(id: string, size = 24): string {
  const path = modulePaths[id];
  return path ? `<svg class="module-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>` : '';
}

/** Same drawing recolored through currentColor so CSS can drive the state color. */
export function monoIcon(name: StatIcon, size = 12): string {
  const mono = paths[name].replace(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"');
  return `<svg class="stat-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${mono}</svg>`;
}
