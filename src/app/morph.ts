import { Tween } from '../core/motion';
import type { Sprite } from '../graphics/scene/types';
import { easeInOutQuart, lerp } from '../utils/math';

/**
 * Carries one Asset between Views: lerps every sprite parameter from a snapshot to
 * a live target (the target can still be moving, e.g. a Work card easing in).
 */
export class Morph {
  readonly sprite: Sprite;
  private tween = new Tween();

  constructor(
    private from: Sprite,
    private target: () => Sprite | null,
    duration: number,
    onDone: () => void,
  ) {
    this.sprite = { ...from, id: 'morph' };
    this.tween.start(duration, onDone);
  }

  get active(): boolean {
    return this.tween.active;
  }

  update(dt: number): boolean {
    const running = this.tween.update(dt);
    const to = this.target();
    const t = easeInOutQuart(this.tween.progress);
    const a = this.from;
    const s = this.sprite;
    if (!to) {
      s.opacity = lerp(a.opacity, 0, t);
      return running;
    }
    s.x = lerp(a.x, to.x, t);
    s.y = lerp(a.y, to.y, t);
    s.w = lerp(a.w, to.w, t);
    s.h = lerp(a.h, to.h, t);
    s.ix = lerp(a.ix, to.ix, t);
    s.iy = lerp(a.iy, to.iy, t);
    s.iw = lerp(a.iw, to.iw, t);
    s.ih = lerp(a.ih, to.ih, t);
    s.radius = lerp(a.radius, to.radius, t);
    s.innerRadius = lerp(a.innerRadius, to.innerRadius, t);
    s.card = lerp(a.card, to.card, t);
    s.opacity = lerp(a.opacity, to.opacity, t);
    s.image = lerp(a.image, to.image, t);
    s.hover = lerp(a.hover, to.hover, t);
    s.lift = lerp(a.lift, to.lift, t);
    s.fade = t < 0.5 ? a.fade : to.fade;
    // A soft arc through the move so the Asset feels carried, not slid.
    s.bend = Math.sin(t * Math.PI) * Math.min(28, Math.abs(to.y - a.y) * 0.05);
    return running;
  }
}
