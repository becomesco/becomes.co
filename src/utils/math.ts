export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));

export const saturate = (v: number): number => clamp(v, 0, 1);

/** Frame-rate independent exponential approach. `k` is the rate per second. */
export const damp = (current: number, target: number, k: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-k * dt));

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = saturate(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export const easeInOutQuart = (t: number): number => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
