export type ChromeView = 'home' | 'work' | 'about' | 'contact';

/** Persistent wordmark, back control, and About/Contact navigation. Browser layer only. */
export class Chrome {
  private root: HTMLElement;
  private back: HTMLElement;
  private links: HTMLAnchorElement[];

  constructor() {
    this.root = document.querySelector<HTMLElement>('.chrome')!;
    this.back = this.root.querySelector<HTMLElement>('.chrome__back')!;
    this.links = Array.from(this.root.querySelectorAll<HTMLAnchorElement>('[data-nav]'));
  }

  reveal(): void {
    this.root.classList.add('chrome--in');
  }

  setView(view: ChromeView): void {
    this.back.classList.toggle('chrome__back--in', view === 'work');
    this.back.toggleAttribute('inert', view !== 'work');
    for (const link of this.links) {
      if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
}
