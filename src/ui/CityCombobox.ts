import { STARTING_CITIES } from '../data/cities';
/** Themeable suggestions; free text remains valid when the city is not in the list. */
export class CityCombobox {
  private readonly root = document.getElementById('city-picker')!;
  private readonly input = document.getElementById('destination-city') as HTMLInputElement;
  private readonly toggle = document.getElementById('toggle-cities') as HTMLButtonElement;
  private readonly panel = document.getElementById('city-options-panel')!;
  private readonly list = document.getElementById('city-suggestions')!;
  private matches: readonly string[] = STARTING_CITIES;
  private active = 0;
  constructor(signal: AbortSignal) {
    this.close();
    this.toggle.addEventListener('click', () => { if (this.panel.hidden) this.open(); else this.close(); }, { signal });
    this.input.addEventListener('focus', () => this.open(), { signal });
    this.input.addEventListener('input', () => {
      const query = this.input.value.trim(); this.matches = STARTING_CITIES.filter(city => city.includes(query));
      this.active = 0; this.show();
    }, { signal });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.panel.hidden) this.open();
        else if (this.matches.length) this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.matches.length) % this.matches.length;
        this.render(); document.getElementById(`city-option-${this.active}`)?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && !this.panel.hidden) {
        event.preventDefault(); if (this.matches.length) this.choose(this.matches[this.active]); else this.close();
      } else if (event.key === 'Escape' || event.key === 'Tab') this.close();
    }, { signal });
    this.toggle.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); this.input.focus(); this.open(); }
      if (event.key === 'Escape' || event.key === 'Tab') this.close();
    }, { signal });
    document.addEventListener('pointerdown', event => { if (!this.root.contains(event.target as Node)) this.close(); }, { signal });
    this.root.addEventListener('focusout', event => { if (!this.root.contains(event.relatedTarget as Node | null)) this.close(); }, { signal });
    signal.addEventListener('abort', () => this.close(), { once: true });
  }
  close(): void {
    this.panel.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.toggle.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }
  private open(): void {
    if (this.input.disabled) return;
    this.matches = STARTING_CITIES; this.active = Math.max(0, this.matches.indexOf(this.input.value)); this.show();
  }
  private show(): void {
    this.panel.hidden = false; this.input.setAttribute('aria-expanded', 'true'); this.toggle.setAttribute('aria-expanded', 'true'); this.render();
  }
  private choose(city: string): void { this.input.value = city; this.close(); }
  private render(): void {
    this.list.replaceChildren();
    document.getElementById('city-empty')!.hidden = this.matches.length > 0;
    this.input.removeAttribute('aria-activedescendant');
    this.matches.forEach((city, index) => {
      const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1; option.id = `city-option-${index}`;
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(city === this.input.value));
      option.className = index === this.active ? 'city-option is-active' : 'city-option'; option.textContent = city;
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => { this.choose(city); this.toggle.focus({ preventScroll: true }); });
      this.list.append(option);
    });
    if (this.matches.length) this.input.setAttribute('aria-activedescendant', `city-option-${this.active}`);
  }
}
