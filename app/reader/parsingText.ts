export function normalizeReadingText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (segment) => segment.segment,
    );
  }
  return Array.from(text);
}

export function isLikelyHeading(text: string): boolean {
  if (graphemes(text).length > 90) return false;
  if (/^[IVXLCDM]+[.:]?$/.test(text)) return true;
  if (/^(chapter|part|book|section)\s+([0-9ivxlcdm]+|[a-z]+)\b/i.test(text)) return true;
  const letters = graphemes(text).filter((character) => /\p{L}/u.test(character));
  return letters.length >= 3
    && text.split(/\s+/).length <= 10
    && letters.every((letter) => /[\p{Lu}\p{Lt}]/u.test(letter));
}
