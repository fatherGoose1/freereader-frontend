import { graphemes, normalizeReadingText } from "./parsingText";
import type { LibraryBook, TextBlock } from "./types";

export const READING_CHUNK_REVISION = 1;

/** Pack whole sentences first, splitting only sentences that exceed the limit. */
export function chunkReadingText(text: string, limit: number, fallback: (text: string) => string[]): string[] {
  if (!text) return [];
  const length = (value: string) => graphemes(value).length;
  if (length(text) <= limit) return [text];

  const splitAt = (value: string, pattern: RegExp) => {
    const pieces: string[] = [];
    let start = 0;
    for (const match of value.matchAll(pattern)) {
      const end = match.index + match[0].length;
      const piece = value.slice(start, end).trim();
      if (piece) pieces.push(piece);
      start = end;
    }
    const remaining = value.slice(start).trim();
    if (remaining) pieces.push(remaining);
    return pieces;
  };
  const pack = (units: string[], splitLong: (unit: string) => string[], source: string) => {
    const chunks: string[] = [];
    let current = "";
    let currentLength = 0;
    let sourceOffset = 0;
    const flush = () => { if (current) chunks.push(current); current = ""; currentLength = 0; };
    for (const unit of units) {
      const unitLength = length(unit);
      const start = source.indexOf(unit, sourceOffset);
      sourceOffset = start + unit.length;
      const separator = current && /\s/.test(source[start - 1] ?? "") ? " " : "";
      if (unitLength > limit) {
        flush();
        chunks.push(...splitLong(unit));
      } else {
        if (current && currentLength + separator.length + unitLength > limit) flush();
        current = current ? `${current}${separator}${unit}` : unit;
        currentLength += (currentLength ? separator.length : 0) + unitLength;
      }
    }
    flush();
    return chunks;
  };
  const clausePatterns = [/[;:；：]["'”’»)\]]*(?=\s|$)|\s[—–]\s/g, /[,，、]["'”’»)\]]*(?=\s|$)|[，、]/g];
  const splitLongSentence = (sentence: string, level = 0): string[] => {
    if (length(sentence) <= limit) return [sentence];
    if (level >= clausePatterns.length) return fallback(sentence);
    const clauses = splitAt(sentence, clausePatterns[level]);
    return clauses.length > 1
      ? pack(clauses, (clause) => splitLongSentence(clause, level + 1), sentence)
      : splitLongSentence(sentence, level + 1);
  };
  const sentences = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text), (segment) => segment.segment.trim()).filter(Boolean)
    : splitAt(text, /[.!?]+["'”’»)\]]*(?=\s|$)|[。！？]+["'”’»)\]]*/g);
  return pack(sentences, splitLongSentence, text);
}

/** Repair existing PDF chunks without changing original page associations. */
export function rechunkPdfBook(book: LibraryBook, split: (text: string) => string[]): LibraryBook {
  if (book.format !== "pdf" || book.chunkingRevision === READING_CHUNK_REVISION) return book;
  const blocks: TextBlock[] = [];
  const indexes = new Map<number, number>();
  let cursor = 0;
  while (cursor < book.blocks.length) {
    const first = book.blocks[cursor];
    if (first.isHeading) {
      indexes.set(first.index, blocks.length);
      blocks.push({ ...first, index: blocks.length });
      cursor += 1;
      continue;
    }
    const group: TextBlock[] = [first];
    cursor += 1;
    while (cursor < book.blocks.length) {
      const next = book.blocks[cursor];
      if (next.isHeading || next.page !== first.page || next.chapterIndex !== first.chapterIndex
        || /[.!?。！？]["'”’»)\]]*$/.test(group.at(-1)!.text.trim())) break;
      group.push(next);
      cursor += 1;
    }
    const text = normalizeReadingText(group.map((block) => block.text).join(" "));
    const chunks = split(text);
    const startIndex = blocks.length;
    let offset = 0;
    const starts = chunks.map((chunk) => { const start = text.indexOf(chunk, offset); offset = start + chunk.length; return start; });
    let originalOffset = 0;
    for (const original of group) {
      let chunkIndex = 0;
      for (let index = 1; index < starts.length && starts[index] <= originalOffset; index += 1) chunkIndex = index;
      indexes.set(original.index, startIndex + chunkIndex);
      originalOffset += original.text.length + 1;
    }
    for (const chunk of chunks) blocks.push({ ...first, index: blocks.length, text: chunk });
  }
  const blockIndex = indexes.get(book.position.blockIndex) ?? 0;
  const samePassage = blocks[blockIndex]?.text === book.blocks[book.position.blockIndex]?.text;
  const now = new Date().toISOString();
  return {
    ...book,
    chunkingRevision: READING_CHUNK_REVISION,
    blocks,
    chapters: book.chapters.map((chapter) => ({ ...chapter, startBlockIndex: indexes.get(chapter.startBlockIndex) ?? 0 })),
    updatedAt: now,
    position: { ...book.position, blockIndex, offsetSeconds: samePassage ? book.position.offsetSeconds : 0, updatedAt: now },
  };
}
