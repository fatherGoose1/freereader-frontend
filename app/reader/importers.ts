import { Readability } from "@mozilla/readability";
import ePub from "epubjs";
import type Section from "epubjs/types/section";
import mammoth from "mammoth";
import { graphemes, isLikelyHeading, normalizeReadingText as normalize } from "./parsingText";
import type { Chapter, DocumentFormat, ParsedBook, TextBlock } from "./types";

const MAX_BLOCK_LENGTH = 300;

enum BreakKind {
  Semantic,
  Word,
  Character,
}

class BookBuilder {
  chapters: Chapter[] = [];
  blocks: TextBlock[] = [];
  private chapterIndex = -1;

  chapter(rawTitle: string) {
    const title = normalize(rawTitle);
    if (!title) return;
    this.chapterIndex += 1;
    this.chapters.push({ title, startBlockIndex: this.blocks.length });
    this.blocks.push({
      index: this.blocks.length,
      text: title,
      chapterIndex: this.chapterIndex,
      isHeading: true,
    });
  }

  paragraph(rawText: string, page?: number) {
    for (const text of chunkText(normalize(rawText))) {
      this.blocks.push({
        index: this.blocks.length,
        text,
        chapterIndex: this.chapterIndex,
        isHeading: false,
        page,
      });
    }
  }

  plainText(rawText: string, page?: number) {
    const lines = rawText.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/);
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) this.paragraph(paragraph.join(" "), page);
      paragraph = [];
    };
    for (const rawLine of lines) {
      const line = normalize(rawLine);
      if (!line) flush();
      else if (isLikelyHeading(line)) {
        flush();
        this.chapter(line);
      } else paragraph.push(line);
    }
    flush();
  }
}

function chunkText(text: string): string[] {
  if (!text) return [];
  const characters = graphemes(text);
  if (characters.length <= MAX_BLOCK_LENGTH) return [text];
  const breaks = new Map<number, BreakKind>([[0, BreakKind.Semantic], [characters.length, BreakKind.Semantic]]);
  const addBreak = (offset: number, kind: BreakKind) => {
    if (offset <= 0 || offset >= characters.length) return;
    const existing = breaks.get(offset);
    if (existing === undefined || kind < existing) breaks.set(offset, kind);
  };

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    for (const segment of segmenter.segment(text)) {
      addBreak(graphemes(text.slice(0, segment.index + segment.segment.length)).length, BreakKind.Semantic);
    }
  } else {
    for (const match of text.matchAll(/[.!?]+["')\]]?\s+/g)) {
      addBreak(graphemes(text.slice(0, (match.index ?? 0) + match[0].length)).length, BreakKind.Semantic);
    }
  }

  const quotePairs = new Map<string, string>([
    ['"', '"'], ["“", "”"], ["‘", "’"], ["„", "“"], ["‚", "‘"],
    ["«", "»"], ["»", "«"], ["‹", "›"], ["›", "‹"],
    ["「", "」"], ["『", "』"], ["〈", "〉"], ["《", "》"],
  ]);
  const expectedClosers: string[] = [];
  characters.forEach((character, offset) => {
    if (expectedClosers.at(-1) === character) {
      expectedClosers.pop();
      return;
    }
    const closer = quotePairs.get(character);
    if (!closer) return;
    if (character === '"') {
      const prior = characters[offset - 1];
      const opens = offset === 0 || /\s/.test(prior) || "([{,:;!?—–-".includes(prior);
      if (!opens || offset + 1 >= characters.length || /\s/.test(characters[offset + 1])) return;
    }
    if (!expectedClosers.length) addBreak(offset, BreakKind.Semantic);
    expectedClosers.push(closer);
  });

  const fallbackInterval = Math.floor(MAX_BLOCK_LENGTH / 2);
  let runStart = 0;
  characters.forEach((character, offset) => {
    if (!/\s/.test(character)) return;
    addBreak(offset + 1, BreakKind.Word);
    if (offset - runStart > MAX_BLOCK_LENGTH) {
      for (let fallback = runStart + fallbackInterval; fallback < offset; fallback += fallbackInterval) {
        addBreak(fallback, BreakKind.Character);
      }
    }
    runStart = offset + 1;
  });
  if (characters.length - runStart > MAX_BLOCK_LENGTH) {
    for (let fallback = runStart + fallbackInterval; fallback < characters.length; fallback += fallbackInterval) {
      addBreak(fallback, BreakKind.Character);
    }
  }

  const offsets = Array.from(breaks.keys()).sort((a, b) => a - b);
  type Score = { blockCount: number; breakCost: number; raggedness: number; previous: number };
  const scores: Array<Score | undefined> = [{ blockCount: 0, breakCost: 0, raggedness: 0, previous: -1 }];
  const better = (candidate: Score, current?: Score) => !current
    || candidate.blockCount < current.blockCount
    || (candidate.blockCount === current.blockCount && candidate.breakCost < current.breakCost)
    || (candidate.blockCount === current.blockCount && candidate.breakCost === current.breakCost && candidate.raggedness < current.raggedness);
  for (let endIndex = 1; endIndex < offsets.length; endIndex += 1) {
    const end = offsets[endIndex];
    for (let startIndex = endIndex - 1; startIndex >= 0; startIndex -= 1) {
      const start = offsets[startIndex];
      const length = end - start;
      if (length > MAX_BLOCK_LENGTH) break;
      const prior = scores[startIndex];
      if (!prior || length <= 0) continue;
      const slack = MAX_BLOCK_LENGTH - length;
      const candidate: Score = {
        blockCount: prior.blockCount + 1,
        breakCost: prior.breakCost + (end === characters.length ? 0 : breaks.get(end)!),
        raggedness: prior.raggedness + slack * slack,
        previous: startIndex,
      };
      if (better(candidate, scores[endIndex])) scores[endIndex] = candidate;
    }
  }
  const ranges: Array<[number, number]> = [];
  let endIndex = offsets.length - 1;
  while (endIndex > 0 && scores[endIndex]) {
    const previous = scores[endIndex]!.previous;
    ranges.push([offsets[previous], offsets[endIndex]]);
    endIndex = previous;
  }
  return ranges.reverse().map(([start, end]) => characters.slice(start, end).join("").trim()).filter(Boolean);
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}

function appendElements(builder: BookBuilder, elements: Iterable<Element>) {
  for (const element of elements) {
    const text = element.textContent ?? "";
    const tag = element.localName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) builder.chapter(text);
    else if (tag === "li") builder.paragraph(`- ${text}`);
    else if (tag === "blockquote") builder.paragraph(`"${text}"`);
    else builder.paragraph(text);
  }
}

function elementsToBook(document: Document, fallbackTitle: string, format: DocumentFormat): ParsedBook {
  const builder = new BookBuilder();
  appendElements(builder, document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote"));
  if (!builder.blocks.length) builder.plainText(document.body?.textContent ?? "");
  return { title: normalize(document.title) || fallbackTitle, format, chapters: builder.chapters, blocks: builder.blocks };
}

function parseHtml(html: string, fallbackTitle: string, format: DocumentFormat): ParsedBook {
  return elementsToBook(new DOMParser().parseFromString(html, "text/html"), fallbackTitle, format);
}

async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const book = ePub(buffer);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const builder = new BookBuilder();
  const sections: Section[] = [];
  book.spine.each((item: Section) => sections.push(item));
  for (const item of sections) {
    await item.load(book.load.bind(book));
    const elements = Array.from(item.document?.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li") ?? [])
      .map((element) => ({
        text: normalize(element.textContent ?? ""),
        isHeading: /^h[1-6]$/.test(element.localName.toLowerCase()),
      }))
      .filter((element) => element.text);
    if (!elements.some((element) => element.isHeading) && elements.length) {
      builder.chapter(`Chapter ${builder.chapters.length + 1}`);
    }
    for (const element of elements) {
      if (element.isHeading) builder.chapter(element.text);
      else builder.paragraph(element.text);
    }
    item.unload();
  }
  book.destroy();
  return {
    title: normalize(metadata.title) || fallbackTitle,
    author: normalize(metadata.creator ?? "") || undefined,
    format: "epub",
    chapters: builder.chapters,
    blocks: builder.blocks,
  };
}

async function parsePdf(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const builder = new BookBuilder();
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const content = await (await pdf.getPage(index)).getTextContent();
    const text = content.items.map((item) => {
      if (!("str" in item)) return "";
      return `${item.str}${item.hasEOL ? "\n" : " "}`;
    }).join("");
    builder.plainText(text, index);
  }
  return { title: fallbackTitle, format: "pdf", chapters: builder.chapters, blocks: builder.blocks };
}

function parsePlainText(text: string, fallbackTitle: string, format: DocumentFormat = "txt"): ParsedBook {
  const builder = new BookBuilder();
  builder.plainText(text);
  return { title: fallbackTitle, format, chapters: builder.chapters, blocks: builder.blocks };
}

function markdownToHtml(markdown: string, sourceName: string): string {
  let lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() === "---") {
    const end = lines.slice(1).findIndex((line) => line.trim() === "---");
    if (end >= 0) lines = lines.slice(end + 2);
  }
  const elements: string[] = [];
  let paragraph: string[] = [];
  let codeFence = false;
  const plain = (value: string) => normalize(value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/\*\*|__|~~/g, "")
    .replace(/(^|\W)[*_]|[*_](?=\W|$)/g, "$1"));
  const append = (tag: string, value: string) => {
    const text = plain(value);
    if (text) elements.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
  };
  const flush = () => {
    if (paragraph.length) append("p", paragraph.join(" "));
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) { flush(); codeFence = !codeFence; continue; }
    if (codeFence) continue;
    if (!trimmed) { flush(); continue; }
    if (trimmed.startsWith("<")) { flush(); continue; }
    const underline = lines[index + 1]?.trim();
    if (/^=+$/.test(underline ?? "")) { flush(); append("h1", trimmed); index += 1; continue; }
    if (/^-+$/.test(underline ?? "")) { flush(); append("h2", trimmed); index += 1; continue; }
    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) { flush(); append(`h${heading[1].length}`, heading[2]); continue; }
    if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(trimmed)) { flush(); continue; }
    const list = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (list) { flush(); append("li", list[1]); continue; }
    if (trimmed.startsWith(">")) { flush(); append("blockquote", trimmed.slice(1)); continue; }
    if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
      flush(); append("h3", trimmed.slice(2, -2)); continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  const firstHeading = elements[0]?.match(/^<h1>(.*)<\/h1>$/)?.[1];
  const title = firstHeading || escapeHtml(titleFromName(sourceName) || "Markdown Document");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main><article>${elements.join("\n")}</article></main></body></html>`;
}

function parseReadableHtml(html: string, sourceUrl: URL): ParsedBook {
  const document = new DOMParser().parseFromString(html, "text/html");
  const bodyText = normalize(document.body?.textContent ?? "");
  if (bodyText.length < 1_500 && [
    "subscribe to continue", "subscription required", "already a subscriber", "sign in to continue",
    "log in to continue", "register to continue", "this content is for subscribers", "purchase a subscription",
  ].some((phrase) => bodyText.toLowerCase().includes(phrase))) throw new Error("This article appears to require a login or subscription.");
  const readable = new Readability(document, { charThreshold: 200 }).parse();
  if (!readable?.content) throw new Error("The page does not contain enough readable article text.");
  const article = new DOMParser().parseFromString(readable.content, "text/html");
  const title = normalize(readable.title ?? "") || sourceUrl.hostname.replace(/^www\./, "");
  const builder = new BookBuilder();
  builder.chapter(title);
  let previous = "";
  let skippedTitle = false;
  for (const element of article.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote")) {
    const text = normalize(element.textContent ?? "");
    const tag = element.localName.toLowerCase();
    const isHeading = /^h[1-6]$/.test(tag);
    if (text.length < (isHeading ? 2 : 20) || text === previous) continue;
    if (tag === "p") {
      const linkText = normalize(Array.from(element.querySelectorAll("a")).map((link) => link.textContent).join(" "));
      if (linkText.length / text.length > 0.55) continue;
    }
    if (isHeading) {
      if (!skippedTitle && text.localeCompare(title, undefined, { sensitivity: "base" }) === 0) skippedTitle = true;
      else builder.chapter(text);
    } else if (tag === "li") builder.paragraph(`- ${text}`);
    else if (tag === "blockquote") builder.paragraph(`"${text}"`);
    else builder.paragraph(text);
    previous = text;
  }
  const readableCharacters = builder.blocks.reduce((total, block) => total + block.text.length, 0);
  if (builder.blocks.length < 2 || readableCharacters < 200) throw new Error("The page does not contain enough readable article text.");
  return { title, format: "html", chapters: builder.chapters, blocks: builder.blocks };
}

export async function parseFile(file: File): Promise<ParsedBook> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const title = titleFromName(file.name);
  const buffer = await file.arrayBuffer();
  let parsed: ParsedBook;
  if (extension === "epub") parsed = await parseEpub(buffer, title);
  else if (extension === "pdf") parsed = await parsePdf(buffer, title);
  else if (extension === "docx") {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    parsed = parseHtml(result.value, title, "docx");
  } else if (["html", "htm"].includes(extension ?? "")) parsed = parseHtml(await file.text(), title, "html");
  else if (["md", "markdown", "mdown", "mkd"].includes(extension ?? "")) parsed = parseHtml(markdownToHtml(await file.text(), file.name), title, "md");
  else if (["txt", "text"].includes(extension ?? "")) parsed = parsePlainText(await file.text(), title);
  else throw new Error("Choose an EPUB, PDF, TXT, DOCX, HTML, or Markdown file.");
  if (!parsed.blocks.some((block) => !block.isHeading)) throw new Error("No readable text was found. Scanned PDFs need OCR before import.");
  return parsed;
}

export async function parseWebLink(rawUrl: string): Promise<{ parsed: ParsedBook; sourceUrl: string }> {
  const sourceUrl = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
  if (!/^https?:$/.test(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error("Enter a valid public web address.");
  try {
    const response = await fetch(sourceUrl, { headers: { Accept: "text/html,text/markdown,text/plain" } });
    if (!response.ok) throw new Error("Direct fetch failed");
    const contentType = response.headers.get("content-type") ?? "";
    const source = await response.text();
    if (contentType.includes("markdown") || /\.md$/i.test(sourceUrl.pathname)) {
      return { parsed: { ...parseHtml(markdownToHtml(source, sourceUrl.pathname), titleFromName(sourceUrl.pathname), "md"), format: "html" }, sourceUrl: response.url };
    }
    if (contentType.includes("text/plain")) return { parsed: parsePlainText(source, titleFromName(sourceUrl.pathname), "html"), sourceUrl: response.url };
    return { parsed: parseReadableHtml(source, new URL(response.url)), sourceUrl: response.url };
  } catch (directError) {
    const response = await fetch("/api/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl.toString() }),
    });
    const payload = (await response.json()) as { title?: string; text?: string; source_url?: string; error?: string };
    if (!response.ok || !payload.text) {
      if (directError instanceof Error && response.status === 503) throw directError;
      throw new Error(payload.error ?? "The page could not be imported.");
    }
    const builder = new BookBuilder();
    const title = payload.title || sourceUrl.hostname;
    builder.chapter(title);
    builder.plainText(payload.text);
    return { parsed: { title, format: "html", chapters: builder.chapters, blocks: builder.blocks }, sourceUrl: payload.source_url ?? sourceUrl.toString() };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
