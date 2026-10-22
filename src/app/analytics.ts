declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function pageView(): void {
  window.gtag?.('config', 'UA-172016979-2', {
    page_path: location.pathname,
    page_title: document.title,
    page_location: location.href,
  });
}
