export const TEXT_PIPELINE_REVISION = "text-7";

const ROMAN_NUMERAL = /^(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i;

function romanNumeralValue(numeral: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1_000 };
  let total = 0;
  let previous = 0;
  for (const character of Array.from(numeral.toUpperCase()).reverse()) {
    const value = values[character];
    total += value < previous ? -value : value;
    previous = value;
  }
  return total;
}

function replaceRomanNumerals(text: string, isHeading: boolean): string {
  let normalized = text.replace(
    /\b(chapter|part|book|section)(\s+)([MDCLXVI]+)\b/gi,
    (match, prefix: string, spacing: string, numeral: string) => ROMAN_NUMERAL.test(numeral)
      ? `${prefix}${spacing}${romanNumeralValue(numeral)}`
      : match,
  );

  // In prose, a single I is much more likely to be the pronoun than a numeral.
  const tokenPattern = isHeading ? /\b[MDCLXVI]{2,}\b/gi : /\b[MDCLXVI]{2,}\b/g;
  normalized = normalized.replace(tokenPattern, (numeral) => {
    if (numeral.toUpperCase() === "MIX" || !ROMAN_NUMERAL.test(numeral)) return numeral;
    return String(romanNumeralValue(numeral));
  });
  if (isHeading) {
    normalized = normalized.replace(
      /^(\s*)([MDCLXVI])(\s*[.:]?\s*)$/i,
      (match, leading: string, numeral: string, trailing: string) => ROMAN_NUMERAL.test(numeral)
        ? `${leading}${romanNumeralValue(numeral)}${trailing}`
        : match,
    );
  }
  return normalized;
}

function normalizeCapitalization(text: string): string {
  let result = "";
  let word = "";
  const appendWord = () => {
    if (!word) return;
    const characters = Array.from(word);
    const uppercaseCount = characters.filter((character) => /[\p{Lu}\p{Lt}]/u.test(character)).length;
    result += uppercaseCount > 1
      ? characters[0] + characters.slice(1).join("").toLowerCase()
      : word;
    word = "";
  };
  for (const character of text) {
    if (/\p{L}/u.test(character) || (word && "'’-".includes(character))) {
      word += character;
    } else {
      appendWord();
      result += character;
    }
  }
  appendWord();
  return result;
}

export function normalizeForSpeech(text: string, isHeading = false): string {
  let normalized = normalizeCapitalization(replaceRomanNumerals(text, isHeading))
    .normalize("NFKD")
    .replace(/[\u2600-\u27bf\u{1f300}-\u{1faff}]/gu, "")
    .replace(/\s*(?:-{2,}|[‒–—―]+)\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/"/g, "'")
    .replace(/[_\[\]/#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized && !/[.!?;:,)'"”。！？]$/.test(normalized)) normalized += ".";
  return normalized;
}
