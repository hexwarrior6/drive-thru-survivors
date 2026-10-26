/** Preserve the button's SVG and focus when sound state changes. */
export function updateSoundButton(button: HTMLElement, muted: boolean): void {
  button.setAttribute('aria-pressed', String(muted));
  const label = button.querySelector('.control-label');
  if (label) label.textContent = muted ? '静音' : '声音';
  button.setAttribute('aria-label', muted ? '开启游戏声音' : '关闭游戏声音');
  button.setAttribute('title', muted ? '声音已关闭（M）' : '声音已开启（M）');
}

/** The sound button lives across scenes; bind via onclick so scene changes cannot stack toggles. */
export interface MutedStore { get(key: string): unknown; set(key: string, value: unknown): unknown }
export function bindSoundButton(button: HTMLElement, store: MutedStore, onToggle?: (muted: boolean) => void): void {
  updateSoundButton(button, store.get('muted') === true);
  button.onclick = () => {
    const muted = store.get('muted') !== true;
    store.set('muted', muted);
    updateSoundButton(button, muted);
    onToggle?.(muted);
  };
}
