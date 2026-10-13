export function safeEduReturn(value: string | null, origin: string, root: string) {
  const fallback = root.endsWith("/") ? root : `${root}/`;
  if (!value?.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(value)) return fallback;
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return fallback;
    const prefix = root === "/" ? "" : root.replace(/\/$/, "");
    const relative = target.pathname.slice(prefix.length);
    if (prefix && target.pathname !== prefix && !target.pathname.startsWith(`${prefix}/`)) return fallback;
    if (!/^\/?$|^\/(?:calendar|admin)$|^\/assignments\/(?:new|[a-f0-9-]{36})(?:\/edit)?$|^\/classes\/[a-f0-9-]{36}$|^\/invite\/[A-Za-z0-9_-]{20,128}$/.test(relative)) return fallback;
    return target.pathname; // OAuth codes/arbitrary query strings are never carried forward.
  } catch { return fallback; }
}
