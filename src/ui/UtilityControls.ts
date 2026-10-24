/** Preserve the button's SVG and focus when sound state changes. */
export function updateSoundButton(button: HTMLElement, muted: boolean): void {
  button.setAttribute('aria-pressed', String(muted));
  const label = button.querySelector('.control-label');
  if (label) label.textContent = muted ? '静音' : '声音';
  button.setAttribute('aria-label', muted ? '开启游戏声音' : '关闭游戏声音');
  button.setAttribute('title', muted ? '声音已关闭（M）' : '声音已开启（M）');
}
