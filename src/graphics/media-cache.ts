/** Parallel downloads while preloading; the rest of the list waits its turn, in order. */
const PRELOAD_PARALLEL = 6;

/**
 * Compressed media files, held in memory for the session once fetched, so a texture can be
 * decoded again (after eviction, device loss, or a level change) without touching the network.
 */
const files = new Map<string, Promise<Blob>>();

export function fetchMedia(url: string): Promise<Blob> {
  let file = files.get(url);
  if (!file) {
    file = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.blob();
    });
    files.set(url, file);
    // A failed file is fetched again the next time it is asked for.
    file.catch(() => files.delete(url));
  }
  return file;
}

/** Downloads `urls` in order; `onProgress` gets the share settled, 0 → 1. Never rejects. */
export async function preloadMedia(urls: readonly string[], onProgress: (share: number) => void): Promise<void> {
  const unique = [...new Set(urls)];
  if (!unique.length) return onProgress(1);
  let next = 0;
  let settled = 0;
  const worker = async (): Promise<void> => {
    while (next < unique.length) {
      const url = unique[next++];
      await fetchMedia(url).catch((error: unknown) => console.warn('[media] preload failed', url, error));
      onProgress(++settled / unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PRELOAD_PARALLEL, unique.length) }, worker));
}
