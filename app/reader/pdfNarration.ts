import type { PDFDocumentProxy, StructTreeNode, TextItem } from "pdfjs-dist/types/src/display/api";
import { normalizeReadingText } from "./parsingText";
import { pdfPageForBlock } from "./nativeText";
import { READING_CHUNK_REVISION } from "./readingChunks";
import type { LibraryBook, ParsedBook } from "./types";

export const PDF_NARRATION_REVISION = 1;

type Run = { item: TextItem; index: number; x: number; y: number; fontSize: number; excluded: boolean };
type Line = { runs: Run[]; text: string; y: number; fontSize: number };
type PageText = { page: number; height: number; runs: Run[]; lines: Line[]; bodyFont: number };

function typicalFont(runs: Run[]): number {
  const samples = runs.filter((run) => run.fontSize > 0 && /\p{L}/u.test(run.item.str) && !run.excluded)
    .sort((left, right) => left.fontSize - right.fontSize);
  const total = samples.reduce((sum, run) => sum + run.item.str.length, 0);
  let count = 0;
  for (const run of samples) {
    count += run.item.str.length;
    if (count >= total / 2) return run.fontSize;
  }
  return 12;
}

function noteContentIds(tree: StructTreeNode | null): Set<string> {
  const ids = new Set<string>();
  const visit = (node: StructTreeNode, excluded = false) => {
    excluded ||= /^(?:Note|Artifact|Header|Footer)$/i.test(node.role);
    for (const child of node.children) {
      if ("role" in child) visit(child, excluded);
      else if (excluded && child.type === "content") ids.add(child.id);
    }
  };
  if (tree) visit(tree);
  return ids;
}

function marginKey(page: PageText, line: Line): string | undefined {
  const relativeY = line.y / page.height;
  if ((relativeY > 0.16 && relativeY < 0.82) || line.fontSize > page.bodyFont * 1.08 || line.text.length > 180) return;
  const text = line.text.toLocaleLowerCase().replace(/\d+/g, "#");
  return `${relativeY < 0.5 ? "top" : "bottom"}:${Math.round(relativeY * 40)}:${text}`;
}

export async function pdfTextFingerprint(parts: Iterable<string>): Promise<string> {
  const text = Array.from(parts).join("").replace(/\s+/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Keep original text-run indexes so native highlights can skip the same items. */
export async function extractPdfNarration(pdf: PDFDocumentProxy): Promise<{
  pages: { page: number; text: string }[];
  excludedItems: Record<string, number[]>;
  originalTextHash: string;
}> {
  const pages: PageText[] = [];
  const originalText: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const [content, tree] = await Promise.all([
      page.getTextContent({ includeMarkedContent: true }), page.getStructTree().catch(() => null),
    ]);
    const view = page.getViewport({ scale: 1 });
    const notes = noteContentIds(tree);
    const marked: boolean[] = [];
    const runs: Run[] = [];
    let index = 0;
    for (const item of content.items) {
      if (!("str" in item)) {
        if (item.type === "endMarkedContent") marked.pop();
        else marked.push(marked.at(-1) === true || notes.has(item.id)
          || ("tag" in item && item.tag === "Artifact"));
        continue;
      }
      originalText.push(item.str);
      const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]);
      runs.push({ item, index: index++, x, y,
        fontSize: Math.hypot(item.transform[2], item.transform[3]) || item.height,
        excluded: marked.at(-1) === true });
    }
    const rows = new Map<number, Run[]>();
    for (const run of runs) {
      if (!run.item.str.trim()) continue;
      const key = Math.round(run.y / 2);
      const row = rows.get(key) ?? [];
      row.push(run);
      rows.set(key, row);
    }
    const lines = Array.from(rows.values(), (row) => {
      row.sort((left, right) => left.x - right.x);
      return { runs: row, y: row[0].y, fontSize: typicalFont(row),
        text: normalizeReadingText(row.map((run) => run.item.str).join(" ")) };
    }).sort((left, right) => left.y - right.y);
    const bodyRuns = runs.filter((run) => run.y / view.height > 0.12 && run.y / view.height < 0.8);
    pages.push({ page: number, height: view.height, runs, lines, bodyFont: typicalFont(bodyRuns.length ? bodyRuns : runs) });
  }

  const repeated = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const line of page.lines) {
      const key = marginKey(page, line);
      if (!key) continue;
      const occurrences = repeated.get(key) ?? new Set<number>();
      occurrences.add(page.page);
      repeated.set(key, occurrences);
    }
  }
  const pageLabel = /^(?:page\s*)?[-–—(\[]?\s*(?:\d{1,5}|[ivxlcdm]{1,8})(?:\s*(?:of|\/)\s*\d{1,5})?\s*[-–—)\]]?$/i;
  const excludedItems: Record<string, number[]> = {};
  const output: { page: number; text: string }[] = [];
  for (const page of pages) {
    let footnoteStart = Infinity;
    let notesHeading = false;
    for (const [index, line] of page.lines.entries()) {
      const y = line.y / page.height;
      const key = marginKey(page, line);
      const repeatedMargin = !!key && (repeated.get(key)?.size ?? 0) >= Math.min(3, Math.max(2, pdf.numPages));
      const smallMargin = (y < 0.12 || y > 0.82) && line.fontSize < page.bodyFont * 0.88;
      const pageNumber = (y < 0.16 || y > 0.78) && line.fontSize <= page.bodyFont * 1.08 && pageLabel.test(line.text);
      const extremeMargin = (y < 0.035 || y > 0.97) && line.fontSize <= page.bodyFont;
      if (repeatedMargin || smallMargin || pageNumber || extremeMargin) {
        line.runs.forEach((run) => { run.excluded = true; });
        continue;
      }
      const previous = page.lines[index - 1];
      const gap = previous ? line.y - previous.y : 0;
      const small = line.fontSize <= page.bodyFont * 0.92;
      const markedNote = /^(?:\[?\d{1,3}[\].)]?\s+|[†‡*]+\s*|footnotes?\b)/i.test(line.text);
      if (y > 0.5 && /^(?:footnotes?|notes?)\s*:?$/i.test(line.text)) {
        footnoteStart = line.y;
        notesHeading = true;
      } else if (y > 0.6 && small && (markedNote || gap > page.bodyFont * 1.6)) {
        footnoteStart = Math.min(footnoteStart, line.y);
      }
      if (line.y >= footnoteStart && (small || notesHeading)) line.runs.forEach((run) => { run.excluded = true; });
    }
    for (const run of page.runs) {
      const value = run.item.str.trim();
      const y = run.y / page.height;
      const isolatedPageLabel = pageLabel.test(value) && page.lines.some((line) => line.runs.includes(run) && pageLabel.test(line.text));
      if ((y < 0.16 || y > 0.78) && run.fontSize <= page.bodyFont * 1.08
        && pageLabel.test(value) && (run.fontSize < page.bodyFont * 0.9 || isolatedPageLabel)) run.excluded = true;
      // Superscript footnote references should not interrupt the spoken body.
      if (run.fontSize < page.bodyFont * 0.78 && /^(?:\d{1,3}|\[\d{1,3}\]|[†‡*]+)$/.test(value)) run.excluded = true;
    }
    excludedItems[String(page.page)] = page.runs.filter((run) => run.excluded).map((run) => run.index);
    output.push({ page: page.page, text: page.runs.map((run) => run.excluded ? ""
      : `${run.item.str}${run.item.hasEOL ? "\n" : " "}`).join("") });
  }
  return { pages: output, excludedItems, originalTextHash: await pdfTextFingerprint(originalText) };
}

/** Map a legacy cursor onto the cleaned passage on the same original page. */
export function refreshPdfNarration(book: LibraryBook, parsed: ParsedBook): LibraryBook {
  const previous = book.blocks[book.position.blockIndex];
  const page = pdfPageForBlock(book.blocks, book.position.blockIndex);
  const candidates = parsed.blocks.filter((block) => block.page === page);
  const normalize = (text: string) => text.replace(/\s+/g, "");
  const oldText = normalize(previous?.text ?? "");
  const match = candidates.find((block) => oldText && normalize(block.text).includes(oldText))
    ?? candidates.find((block) => {
      const text = normalize(block.text);
      return text.length > 20 && oldText.includes(text);
    })
    ?? candidates.find((block) => oldText.length > 40 && normalize(block.text).includes(oldText.slice(0, 40)))
    ?? candidates[0] ?? parsed.blocks.find((block) => (block.page ?? 1) > page) ?? parsed.blocks.at(-1)!;
  const now = new Date().toISOString();
  return { ...book, blocks: parsed.blocks, chapters: parsed.chapters,
    chunkingRevision: READING_CHUNK_REVISION,
    pdfNarrationRevision: parsed.pdfNarrationRevision, pdfExcludedItems: parsed.pdfExcludedItems,
    pdfOriginalTextHash: parsed.pdfOriginalTextHash, updatedAt: now,
    position: { ...book.position, blockIndex: match.index,
      offsetSeconds: match.text === previous?.text ? book.position.offsetSeconds : 0, updatedAt: now } };
}
