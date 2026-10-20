import type { VirtualScroll } from './scroll';

const LINE_HEIGHT = 16;

interface TouchSample {
  t: number;
  y: number;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** Lets an element with native overflow scrolling keep its own wheel/touch. */
function inNativeScroller(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-native-scroll]') !== null;
}

/**
 * Wheel, touch, and keyboard into the virtual scroll. Handlers only write state
 * and wake the scheduler.
 */
export class ScrollInput {
  private samples: TouchSample[] = [];
  private touchStartY = 0;
  private touchStartTarget = 0;
  private touchId: number | null = null;
  private dragged: VirtualScroll | null = null;

  private get scroll(): VirtualScroll {
    return this.dragged ?? this.active();
  }

  constructor(
    private active: () => VirtualScroll,
    private wake: () => void,
    private pageHeight: () => number,
  ) {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    window.addEventListener('keydown', this.onKey);
  }

  private onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || inNativeScroller(event.target)) return;
    event.preventDefault();
    if (!this.scroll.enabled) return;
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= LINE_HEIGHT;
    else if (event.deltaMode === 2) delta *= this.pageHeight();
    // Trackpads report horizontal swipes on deltaX; let them scroll too when dominant.
    if (Math.abs(event.deltaX) > Math.abs(delta) * 1.5) delta = event.deltaX;
    this.scroll.add(delta);
    this.wake();
  };

  private onTouchStart = (event: TouchEvent): void => {
    if (this.touchId !== null || inNativeScroller(event.target) || isEditable(event.target)) return;
    const touch = event.changedTouches[0];
    this.touchId = touch.identifier;
    this.touchStartY = touch.clientY;
    this.touchStartTarget = this.scroll.target;
    this.samples = [{ t: event.timeStamp, y: touch.clientY }];
    this.dragged = this.active();
    this.dragged.dragging = true;
  };

  private onTouchMove = (event: TouchEvent): void => {
    const touch = this.findTouch(event);
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    if (!this.scroll.enabled) return;
    this.scroll.to(this.touchStartTarget + (this.touchStartY - touch.clientY));
    this.samples.push({ t: event.timeStamp, y: touch.clientY });
    if (this.samples.length > 8) this.samples.shift();
    this.wake();
  };

  private onTouchEnd = (event: TouchEvent): void => {
    const touch = this.findTouch(event);
    if (!touch) return;
    this.touchId = null;
    this.scroll.dragging = false;
    const now = event.timeStamp;
    const recent = this.samples.filter((s) => now - s.t < 100);
    if (recent.length >= 2 && this.scroll.enabled) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      const ms = Math.max(16, last.t - first.t);
      const velocity = ((first.y - last.y) / ms) * 1000;
      this.scroll.add(velocity * 0.3);
    }
    this.samples = [];
    this.dragged = null;
    this.wake();
  };

  private findTouch(event: TouchEvent): Touch | null {
    if (this.touchId === null) return null;
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier === this.touchId) return touch;
    }
    return null;
  }

  private onKey = (event: KeyboardEvent): void => {
    if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!this.scroll.enabled) return;
    const page = this.pageHeight();
    let delta = 0;
    switch (event.key) {
      case 'ArrowDown':
        delta = 100;
        break;
      case 'ArrowUp':
        delta = -100;
        break;
      case 'PageDown':
        delta = page * 0.85;
        break;
      case 'PageUp':
        delta = -page * 0.85;
        break;
      case ' ':
        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
        delta = (event.shiftKey ? -1 : 1) * page * 0.85;
        break;
      case 'Home':
        this.scroll.to(0);
        break;
      case 'End':
        this.scroll.to(this.scroll.max);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (delta) this.scroll.add(delta);
    this.wake();
  };
}
