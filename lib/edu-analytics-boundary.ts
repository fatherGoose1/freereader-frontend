let pause: (() => () => void) | undefined;
export function registerEduAnalyticsPause(callback: () => () => void) { pause = callback; }
export function pauseConsumerAnalyticsForEdu() { return pause?.() ?? (() => {}); }
export function isEduSurface() {
  return window.location.pathname === "/edu" || window.location.pathname.startsWith("/edu/")
    || window.location.hostname === (process.env.NEXT_PUBLIC_EDU_HOST ?? "edu.freereader.io")
    || document.cookie.split(";").some((cookie) => cookie.trim() === "freereader-edu-surface=1")
    || !!document.querySelector('[data-freereader-product="edu"]');
}
