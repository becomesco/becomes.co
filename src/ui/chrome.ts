export type ChromeView = 'home' | 'work' | 'about' | 'contact';

const MORPH_MS = 600;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Persistent wordmark, back control, and About/Contact navigation. Browser layer only. */
export class Chrome {
  private root: HTMLElement;
  private back: HTMLElement;
  private nav: HTMLElement;
  private links: HTMLAnchorElement[];
  private morphs: Animation[] = [];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    this.root = document.querySelector<HTMLElement>('.chrome')!;
    this.back = this.root.querySelector<HTMLElement>('.chrome__back')!;
    this.nav = this.root.querySelector<HTMLElement>('.chrome__nav')!;
    this.links = Array.from(this.root.querySelectorAll<HTMLAnchorElement>('[data-nav]'));
  }

  reveal(): void {
    this.root.classList.add('chrome--in');
  }

  setView(view: ChromeView): void {
    const work = view === 'work';
    if (this.root.classList.contains('chrome--work') !== work) {
      const animate = this.root.classList.contains('chrome--in') && !this.reducedMotion.matches;
      if (!animate) this.root.classList.add('chrome--instant');
      this.morphNav(animate, () => {
        this.root.classList.toggle('chrome--work', work);
        this.back.classList.toggle('chrome__back--in', work);
      });
      if (!animate) {
        void this.root.offsetWidth;
        this.root.classList.remove('chrome--instant');
      }
    }
    this.back.toggleAttribute('inert', !work);
    for (const link of this.links) {
      if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  /** FLIP the nav pill between its row and its stacked layout; layouts where the pill keeps its size do nothing. */
  private morphNav(animate: boolean, change: () => void): void {
    const items = [this.nav, ...this.links];
    const first = animate ? items.map((el) => el.getBoundingClientRect()) : [];
    for (const morph of this.morphs) morph.cancel();
    this.morphs = [];
    change();
    if (!animate) return;

    const last = items.map((el) => el.getBoundingClientRect());
    if (first[0].width === last[0].width && first[0].height === last[0].height) return;

    const timing = { duration: MORPH_MS, easing: EASE_OUT };
    this.morphs = items.map((el, i) =>
      i === 0
        ? el.animate(
            [
              { width: `${first[0].width}px`, height: `${first[0].height}px` },
              { width: `${last[0].width}px`, height: `${last[0].height}px` },
            ],
            timing,
          )
        : el.animate(
            [
              { transform: `translate(${first[i].right - last[i].right}px, ${first[i].top - last[i].top}px)` },
              { transform: 'none' },
            ],
            timing,
          ),
    );
  }
}
