import type { VirtualScroll } from './scroll';

const LINE_HEIGHT = 16;
/** Wheel and fling distance against native scrolling. A finger drag still tracks 1:1. */
const SPEED = 0.9;

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

/** Controls keep their own clicks; a press on them never becomes a drag. */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, label, select, [role="button"]') !== null;
}

/** Mouse travel before a press becomes a drag. Matches the tap distance in `Pointer`. */
const MOUSE_DRAG_DISTANCE = 8;

/**
 * Wheel, touch, mouse drag, and keyboard into the virtual scroll. Handlers only
 * write state and wake the scheduler.
 */
export class ScrollInput {
  private samples: TouchSample[] = [];
  private touchStartY = 0;
  private touchStartTarget = 0;
  private touchId: number | null = null;
  private dragged: VirtualScroll | null = null;
  private mouseId: number | null = null;
  private mouseDownY = 0;
  private mouseDragging = false;

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
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    window.addEventListener('blur', this.cancelMouse);
    window.addEventListener('dragstart', this.onDragStart);
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
    this.scroll.add(delta * SPEED);
    this.wake();
  };

  private onTouchStart = (event: TouchEvent): void => {
    if (this.touchId !== null || this.dragged || inNativeScroller(event.target) || isEditable(event.target)) return;
    const touch = event.changedTouches[0];
    this.touchId = touch.identifier;
    this.beginDrag(touch.clientY, event.timeStamp);
  };

  private onTouchMove = (event: TouchEvent): void => {
    const touch = this.findTouch(event);
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    this.moveDrag(touch.clientY, event.timeStamp);
  };

  private onTouchEnd = (event: TouchEvent): void => {
    const touch = this.findTouch(event);
    if (!touch) return;
    this.touchId = null;
    this.endDrag(event.timeStamp);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.button !== 0 || this.mouseId !== null || this.dragged) return;
    if (inNativeScroller(event.target) || isEditable(event.target) || isInteractive(event.target)) return;
    this.mouseId = event.pointerId;
    this.mouseDownY = event.clientY;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.mouseId) return;
    if (!this.mouseDragging) {
      if (Math.abs(event.clientY - this.mouseDownY) < MOUSE_DRAG_DISTANCE) return;
      this.mouseDragging = true;
      document.documentElement.classList.add('is-drag-scrolling');
      window.getSelection()?.removeAllRanges();
      this.beginDrag(event.clientY, event.timeStamp);
      return;
    }
    this.moveDrag(event.clientY, event.timeStamp);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.mouseId) return;
    if (this.mouseDragging) this.endDrag(event.timeStamp);
    this.cancelMouse();
  };

  private cancelMouse = (): void => {
    if (this.mouseDragging && this.dragged) {
      this.dragged.dragging = false;
      this.samples = [];
      this.dragged = null;
      this.wake();
    }
    this.mouseId = null;
    this.mouseDragging = false;
    document.documentElement.classList.remove('is-drag-scrolling');
  };

  /** A native image or text drag would cancel the pointer and steal the gesture. */
  private onDragStart = (event: DragEvent): void => {
    if (this.mouseId !== null) event.preventDefault();
  };

  private beginDrag(y: number, t: number): void {
    this.touchStartY = y;
    this.touchStartTarget = this.scroll.target;
    this.samples = [{ t, y }];
    this.dragged = this.active();
    this.dragged.dragging = true;
  }

  private moveDrag(y: number, t: number): void {
    if (!this.scroll.enabled) return;
    this.scroll.to(this.touchStartTarget + (this.touchStartY - y));
    this.samples.push({ t, y });
    if (this.samples.length > 8) this.samples.shift();
    this.wake();
  }

  private endDrag(now: number): void {
    if (!this.dragged) return;
    this.scroll.dragging = false;
    const recent = this.samples.filter((s) => now - s.t < 100);
    if (recent.length >= 2 && this.scroll.enabled) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      const ms = Math.max(16, last.t - first.t);
      const velocity = ((first.y - last.y) / ms) * 1000;
      this.scroll.add(velocity * 0.3 * SPEED);
    }
    this.samples = [];
    this.dragged = null;
    this.wake();
  }

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
