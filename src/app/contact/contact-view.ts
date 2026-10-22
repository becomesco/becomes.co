import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { easeOutCubic, lerp, saturate } from '../../utils/math';
import type { AppContext, DrawList, View } from '../view';

const ENDPOINT = (import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined) ?? '/api/contact';
const EMAIL = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
/** Same as Home Asset hover: just under critical damping, ~0.6 s, no bounce. */
const EXPAND_STIFFNESS = 70;
const EXPAND_DAMPING = 16;
/** Slight X shrink at the start so the card grows, not only stretches down. */
const EXPAND_SX = 0.985;
const COPIED_MS = 1600;

/** Contact: directory cards and a native brief form. The GPU only paints the background. */
export class ContactView implements View {
  readonly name = 'contact';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;

  private content: HTMLElement;
  private brief: HTMLElement;
  private rest: HTMLElement[];
  private openBrief: HTMLButtonElement;
  private form: HTMLFormElement;
  private status: HTMLElement;
  private copyButtons: HTMLButtonElement[];
  private copied: HTMLElement;
  private copyTimers = new Map<HTMLButtonElement, number>();
  private expand = new Spring(0, EXPAND_STIFFNESS, EXPAND_DAMPING);
  private closedH = 0;
  private openH = 0;
  private extra = 0;
  private expandStyle = '';
  private pendingFocus = false;
  private openedAt = 0;
  private now = 0;
  private style = '';

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="contact"]')!;
    this.content = this.root.querySelector<HTMLElement>('.contact__content')!;
    this.brief = this.root.querySelector<HTMLElement>('[data-brief-card]')!;
    this.rest = [...this.brief.parentElement!.children].filter((node) => node !== this.brief) as HTMLElement[];
    this.openBrief = this.root.querySelector<HTMLButtonElement>('[data-open-brief]')!;
    this.form = this.root.querySelector<HTMLFormElement>('form')!;
    this.status = this.root.querySelector<HTMLElement>('.contact__status')!;
    this.copyButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-copy]')];
    this.copied = this.root.querySelector<HTMLElement>('.contact__copied')!;
    this.openBrief.addEventListener('click', this.showBrief);
    this.form.addEventListener('submit', this.onSubmit);
    for (const button of this.copyButtons) button.addEventListener('click', this.onCopy);
  }

  open(): void {
    this.openedAt = this.now;
    this.scroll.to(0, true);
    this.style = '';
    this.setBriefOpen(false);
  }

  layout(): void {
    const { height: vh, reducedMotion } = this.ctx.viewport.state;
    this.content.style.transform = 'none';
    this.style = '';
    if (!this.form.hidden) {
      this.openH = this.brief.offsetHeight;
      this.extra = Math.max(0, this.openH - this.closedH);
      this.expandStyle = '';
    }
    const bottom = this.content.offsetTop + this.content.offsetHeight + 80;
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(bottom - vh);
  }

  update(frame: FrameTime): boolean {
    this.now = frame.elapsed;
    const reduced = this.ctx.viewport.state.reducedMotion;
    let active = this.scroll.update(frame.dt);
    if (reduced) this.expand.set(this.expand.target);
    else if (this.expand.update(frame.dt)) active = true;
    this.paintExpand(this.expand.value);
    const reveal = reduced ? 1 : easeOutCubic(saturate((this.now - this.openedAt - 0.15) / 0.8));
    const style = `${this.scroll.current.toFixed(2)}|${reveal.toFixed(3)}|${this.presence.toFixed(3)}`;
    if (style !== this.style) {
      this.style = style;
      this.content.style.opacity = (reveal * this.presence).toFixed(3);
      this.content.style.transform = `translate3d(0, ${((1 - reveal) * 24 - this.scroll.current).toFixed(2)}px, 0)`;
    }
    return active || reveal < 1;
  }

  draw(out: DrawList): void {
    if (this.presence <= 0.001) return;
    const { width, height } = this.ctx.viewport.state;
    out.glows.push({
      x: width * 0.82,
      y: height * 0.2,
      radius: Math.max(width, height) * 0.42,
      color: [1, 1, 1],
      strength: 0.55 * this.presence,
    });
  }

  sleep(): void {
    this.setBriefOpen(false);
    this.form.reset();
    this.setStatus('', false);
    for (const button of this.copyButtons) this.clearCopied(button);
    this.copied.textContent = '';
    this.content.style.opacity = '0';
    this.style = '';
  }

  private onCopy = async (event: MouseEvent): Promise<void> => {
    const button = event.currentTarget as HTMLButtonElement;
    const email = button.dataset.copy!;
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      location.href = `mailto:${email}`;
      return;
    }
    this.clearCopied(button);
    button.toggleAttribute('data-copied', true);
    this.copied.textContent = `${email} copied`;
    this.copyTimers.set(button, window.setTimeout(() => this.clearCopied(button), COPIED_MS));
  };

  private clearCopied(button: HTMLButtonElement): void {
    clearTimeout(this.copyTimers.get(button));
    this.copyTimers.delete(button);
    button.removeAttribute('data-copied');
  }

  private showBrief = (): void => {
    if (this.expand.target === 1) return;
    this.closedH = this.brief.offsetHeight;
    this.setBriefOpen(true);
    this.openH = this.brief.offsetHeight;
    this.extra = Math.max(0, this.openH - this.closedH);
    const reduced = this.ctx.viewport.state.reducedMotion;
    if (reduced || this.extra <= 0) this.expand.set(1);
    else {
      this.expand.set(0);
      this.expand.target = 1;
    }
    this.pendingFocus = true;
    this.layout();
    this.paintExpand(this.expand.value);
    this.ctx.wake();
  };

  private setBriefOpen(open: boolean): void {
    this.brief.classList.toggle('contact-card--open', open);
    this.openBrief.setAttribute('aria-expanded', String(open));
    this.form.toggleAttribute('hidden', !open);
    if (!open) {
      this.expand.set(0);
      this.pendingFocus = false;
      this.closedH = 0;
      this.openH = 0;
      this.extra = 0;
      this.paintExpand(0);
    }
  }

  /**
   * Layout jumps to the open height on the click frame. The spring only writes
   * clip-path + transform so the card grows from the closed size on the compositor.
   */
  private paintExpand(t: number): void {
    const done = t >= 1 || this.extra <= 0 || this.openH <= 0;
    const style = done ? 'rest' : t.toFixed(4);
    if (style !== this.expandStyle) {
      this.expandStyle = style;
      if (done) {
        this.brief.style.transform = '';
        this.brief.style.clipPath = '';
        for (const card of this.rest) card.style.transform = '';
      } else {
        const grown = (this.closedH + this.extra * t) / this.openH;
        const s = lerp(EXPAND_SX, 1, t);
        this.brief.style.clipPath = `inset(0 0 ${((1 - grown) * 100).toFixed(3)}% 0)`;
        this.brief.style.transform = `scale3d(${s.toFixed(4)}, ${s.toFixed(4)}, 1)`;
        const shift = `translate3d(0, ${((t - 1) * this.extra).toFixed(2)}px, 0)`;
        for (const card of this.rest) card.style.transform = shift;
      }
    }
    if (this.pendingFocus && t >= 0.85) {
      this.pendingFocus = false;
      this.form.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
    }
  }

  private onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!this.form.reportValidity()) return;
    const data = new FormData(this.form);
    const button = this.form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    if (!ENDPOINT) {
      if (EMAIL) {
        const help = data.getAll('help').join(', ');
        const budgetSelect = this.form.querySelector<HTMLSelectElement>('select[name="budget"]')!;
        const budget = budgetSelect.value ? budgetSelect.selectedOptions[0].text : '';
        const subject = encodeURIComponent(`Brief from ${data.get('name') ?? ''}`);
        const body = encodeURIComponent(
          `${data.get('message') ?? ''}\n\nHelp: ${help || '—'}\nBudget: ${budget || '—'}\n${data.get('name') ?? ''} <${data.get('email') ?? ''}>\n${data.get('company') ?? ''}`,
        );
        location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
        return;
      }
      this.setStatus('The contact form is not connected yet.', true);
      return;
    }

    button.disabled = true;
    this.setStatus('Sending…', false);
    try {
      const help = data.getAll('help').map(String);
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name') ?? '',
          company: data.get('company') ?? '',
          email: data.get('email') ?? '',
          help,
          budget: data.get('budget') ?? '',
          message: data.get('message') ?? '',
          website: data.get('website') ?? '',
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      this.form.reset();
      this.setStatus('Thanks. We will get back to you shortly.', false);
    } catch {
      this.setStatus('Something went wrong. Please try again.', true);
    } finally {
      button.disabled = false;
    }
  };

  private setStatus(message: string, error: boolean): void {
    this.status.textContent = message;
    this.status.classList.toggle('contact__status--error', error);
  }
}
