import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { easeOutCubic, saturate } from '../../utils/math';
import type { AppContext, DrawList, View } from '../view';

const ENDPOINT = import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined;
const EMAIL = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;

/** Contact: a native HTML form. The GPU only paints the background. */
export class ContactView implements View {
  readonly name = 'contact';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;

  private content: HTMLElement;
  private form: HTMLFormElement;
  private status: HTMLElement;
  private openedAt = 0;
  private now = 0;
  private style = '';

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="contact"]')!;
    this.content = this.root.querySelector<HTMLElement>('.contact__content')!;
    this.form = this.root.querySelector<HTMLFormElement>('form')!;
    this.status = this.root.querySelector<HTMLElement>('.contact__status')!;
    this.form.addEventListener('submit', this.onSubmit);
  }

  open(): void {
    this.openedAt = this.now;
    this.scroll.to(0, true);
    this.style = '';
  }

  layout(): void {
    const { height: vh, reducedMotion } = this.ctx.viewport.state;
    this.content.style.transform = 'none';
    this.style = '';
    const bottom = this.content.offsetTop + this.content.offsetHeight + 80;
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(bottom - vh);
  }

  update(frame: FrameTime): boolean {
    this.now = frame.elapsed;
    const active = this.scroll.update(frame.dt);
    const reduced = this.ctx.viewport.state.reducedMotion;
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

  private onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!this.form.reportValidity()) return;
    const data = new FormData(this.form);
    const button = this.form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    if (!ENDPOINT) {
      if (EMAIL) {
        const subject = encodeURIComponent(`Hello from ${data.get('name') ?? ''}`);
        const body = encodeURIComponent(`${data.get('message') ?? ''}\n\n${data.get('name') ?? ''} <${data.get('email') ?? ''}>`);
        location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
        return;
      }
      this.setStatus('The contact form is not connected yet.', true);
      return;
    }

    button.disabled = true;
    this.setStatus('Sending…', false);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
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
