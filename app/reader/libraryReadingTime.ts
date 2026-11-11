// The reader budgets about 150 spoken words per minute at normal speed.
export function libraryTimeRemaining(words: number, progress: number, speed = 1): string {
  const remaining = Math.max(0, words * (1 - Math.min(1, Math.max(0, progress))));
  const minutes = Math.ceil(remaining / (150 * (speed > 0 ? speed : 1)));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`} left`;
}
