export interface Capabilities {
  webgpu: boolean;
  /** Rough memory class for texture budgets. */
  lowMemory: boolean;
}

export function detectCapabilities(): Capabilities {
  const forceDom = new URLSearchParams(location.search).has('dom');
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return {
    webgpu: !forceDom && 'gpu' in navigator && Boolean(navigator.gpu),
    lowMemory: memory <= 4 || matchMedia('(pointer: coarse)').matches,
  };
}
