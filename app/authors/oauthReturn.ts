const KEY = "freereader-author-oauth-return";
const MAX_AGE_MS = 20 * 60 * 1000;

function validPath(path: string): boolean {
  return /^\/authors(?:\/|$)/.test(path) && !path.includes("\\") && !path.includes("//");
}

export function saveAuthorReturn(path: string): void {
  if (!validPath(path)) throw new Error("Invalid author return path.");
  sessionStorage.setItem(KEY, JSON.stringify({ path, createdAt: Date.now() }));
}

export function takeAuthorReturn(): string | null {
  const stored = sessionStorage.getItem(KEY);
  if (!stored) return null;
  sessionStorage.removeItem(KEY);
  try {
    const value = JSON.parse(stored) as { path: string; createdAt: number };
    return validPath(value.path) && Number.isFinite(value.createdAt)
      && Date.now() - value.createdAt >= 0 && Date.now() - value.createdAt < MAX_AGE_MS
      ? value.path : null;
  } catch { return null; }
}
