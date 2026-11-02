declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

export function pageView(): void {
  if (!GA_ID) return;
  window.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: location.href,
    page_path: location.pathname,
  });
}
