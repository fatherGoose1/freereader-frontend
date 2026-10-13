export type SpokenWord = { start: number; length: number };
export type WordTiming = [index: number, startSeconds: number, endSeconds: number];
export type TimedSpokenWord = { word: SpokenWord; startSeconds: number; endSeconds: number };

export function spokenWords(text: string): SpokenWord[] {
  return [...text.matchAll(/\S+/gu)].map((match) => ({ start: match.index, length: match[0].length }));
}

export function parseWordTimings(value: unknown): WordTiming[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 2_000) return;
  const timings: WordTiming[] = [];
  let previous = -1;
  for (const cue of value) {
    if (!Array.isArray(cue) || cue.length !== 3 || !Number.isSafeInteger(cue[0]) || cue[0] <= previous
      || !Number.isFinite(cue[1]) || !Number.isFinite(cue[2]) || cue[1] < 0 || cue[2] <= cue[1]) return;
    timings.push([cue[0], cue[1], cue[2]]);
    previous = cue[0];
  }
  return timings;
}

/** Kokoro indexes normalized speech words; keep the publisher's original display offsets. */
export function matchWordTimings(text: string, spokenText: string, timings?: WordTiming[]): TimedSpokenWord[] {
  if (!timings) return [];
  const original = spokenWords(text);
  const normalized = spokenWords(spokenText);
  if (original.length !== normalized.length) return [];
  return timings.flatMap(([index, startSeconds, endSeconds]) => original[index]
    ? [{ word: original[index], startSeconds, endSeconds }] : []);
}

export function wordAtTime(timings: TimedSpokenWord[], time: number): SpokenWord | undefined {
  if (!Number.isFinite(time)) return;
  return timings.find(({ startSeconds, endSeconds }) => time >= startSeconds && time < endSeconds)?.word;
}
