import { Readability } from "@mozilla/readability";
import ePub from "epubjs";
import type Section from "epubjs/types/section";
import mammoth from "mammoth";
import { asImportError, fallbackError, ImportError, type ImportFileType } from "./importErrors";
import { detectDocument, fileTypeHint, isBinaryFormat, looksLikeHtml, MAX_IMPORT_BYTES, validateImportSize } from "./importFormats";
import { graphemes, isLikelyHeading, normalizeReadingText as normalize } from "./parsingText";
import { detectSpeechLanguage, normalizeLanguage } from "./speech";
import type { Chapter, DocumentFormat, ParsedBook, TextBlock } from "./types";

const MAX_BLOCK_LENGTH = 300;

function withDetectedLanguage(book: ParsedBook): ParsedBook {
  if (book.language) return book;
  const sample = book.blocks.map((block) => block.text).join(" ").slice(0, 20_000);
  return { ...book, language: detectSpeechLanguage(sample) ?? "en" };
}

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
    if (!this.blocks.at(-1)?.isHeading) {
      this.chapterIndex += 1;
      this.chapters.push({ title, startBlockIndex: this.blocks.length });
    }
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

function contentElements(document: Document): Element[] {
  document.querySelectorAll("script,style,noscript,template,[hidden],[aria-hidden='true']").forEach((element) => element.remove());
  document.querySelectorAll("br").forEach((element) => element.replaceWith(document.createTextNode("\n")));
  return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote"))
    .filter((element) => !element.parentElement?.closest("li,blockquote"));
}

function elementsToBook(document: Document, fallbackTitle: string, format: DocumentFormat): ParsedBook {
  const builder = new BookBuilder();
  appendElements(builder, contentElements(document));
  if (!builder.blocks.length) builder.plainText(document.body?.textContent ?? "");
  return withDetectedLanguage({
    title: normalize(document.title) || fallbackTitle,
    language: normalizeLanguage(document.documentElement.lang),
    format,
    chapters: builder.chapters,
    blocks: builder.blocks,
  });
}

function parseHtml(html: string, fallbackTitle: string, format: DocumentFormat): ParsedBook {
  return elementsToBook(new DOMParser().parseFromString(html, "text/html"), fallbackTitle, format);
}

async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const book = ePub();
  try {
    // Passing bytes to the constructor swallows open failures and leaves ready pending forever.
    await book.open(buffer, "binary");
    await book.ready;
    const metadata = await book.loaded.metadata;
    let cover: Blob | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        const response = await fetch(coverUrl);
        if (response.ok) cover = await response.blob();
      }
    } catch {
      // A missing or malformed cover should not prevent the book from importing.
    }
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
    return {
      title: normalize(metadata.title) || fallbackTitle,
      author: normalize(metadata.creator ?? "") || undefined,
      language: normalizeLanguage(metadata.language),
      format: "epub",
      chapters: builder.chapters,
      blocks: builder.blocks,
      cover,
    };
  } finally {
    book.destroy();
  }
}

async function parsePdf(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  try {
    const pdf = await task.promise;
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
  } finally {
    await task.destroy();
  }
}

function parsePlainText(text: string, fallbackTitle: string, format: DocumentFormat = "txt"): ParsedBook {
  const builder = new BookBuilder();
  builder.plainText(text);
  return withDetectedLanguage({ title: fallbackTitle, format, chapters: builder.chapters, blocks: builder.blocks });
}

function looksLikeMarkdown(text: string): boolean {
  const sample = text.slice(0, 4_000);
  if (/^#{1,6}\s+\S/m.test(sample)) return true;
  if (/^ {0,3}> ?\S/m.test(sample)) return true;
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(sample)) return true;
  if (/\*\*[^*\n]+\*\*/.test(sample)) return true;
  const listLines = sample.split("\n").filter((line) => /^\s*(?:[-+*]|\d+[.)])\s+\S/.test(line));
  return listLines.length >= 3;
}

export function parsePastedText(text: string, fallbackTitle: string): ParsedBook {
  const trimmed = text.trim();
  const parsed = looksLikeHtml(trimmed)
    ? parseHtml(trimmed, fallbackTitle, "html")
    : looksLikeMarkdown(trimmed)
      ? parseHtml(markdownToHtml(trimmed, fallbackTitle), fallbackTitle, "md")
      : parsePlainText(trimmed, fallbackTitle);
  return requireReadableContent(parsed);
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
  ].some((phrase) => bodyText.toLowerCase().includes(phrase))) throw new ImportError("This article appears to require a login or subscription.", "restricted", "restricted_article", "conversion", "html");
  const isRedditEmbed = sourceUrl.hostname === "embed.reddit.com";
  const embedTitle = isRedditEmbed
    ? normalize(document.querySelector("shreddit-embed-title, h1")?.textContent ?? "")
    : "";
  const readable = new Readability(document, { charThreshold: 200 }).parse();
  if (!readable?.content) throw new ImportError("The page does not contain enough readable article text.", "insufficient_content", "insufficient_article", "conversion", "html");
  const title = embedTitle
    || normalize(readable.title ?? "")
    || sourceUrl.hostname.replace(/^www\./, "");
  const article = new DOMParser().parseFromString(readable.content, "text/html");
  const builder = new BookBuilder();
  builder.chapter(title);
  let previous = "";
  let skippedTitle = false;
  for (const element of contentElements(article)) {
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
  const readableCharacters = builder.blocks.filter((block) => !block.isHeading).reduce((total, block) => total + block.text.length, 0);
  if (readableCharacters < (isRedditEmbed ? 20 : 200)) {
    throw new ImportError("The page does not contain enough readable article text.", "insufficient_content", "insufficient_article", "conversion", "html");
  }
  return withDetectedLanguage({
    title,
    language: normalizeLanguage(document.documentElement.lang),
    format: "html",
    chapters: builder.chapters,
    blocks: builder.blocks,
  });
}

function requireReadableContent(parsed: ParsedBook): ParsedBook {
  if (!parsed.blocks.some((block) => !block.isHeading && normalize(block.text))) {
    const message = parsed.format === "pdf" ? "No readable text was found. Scanned PDFs need OCR before import."
      : "No readable text was found. Include more than just headings.";
    throw new ImportError(message, "insufficient_content", "no_readable_text", "conversion", parsed.format);
  }
  return withDetectedLanguage(parsed);
}

async function parseDocument(buffer: ArrayBuffer, name: string, contentType = "", articleUrl?: URL): Promise<ParsedBook> {
  let format = fileTypeHint(name, contentType);
  try {
    validateImportSize(buffer.byteLength, format);
    const detected = await detectDocument(buffer, name, contentType);
    format = detected.format;
    const text = detected.text ?? "";
    const title = name ? titleFromName(name) : articleUrl?.hostname || "Untitled";
    let parsed: ParsedBook;
    if (format === "epub") parsed = await parseEpub(buffer, title);
    else if (format === "pdf") parsed = await parsePdf(buffer, title);
    else if (format === "docx") {
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      parsed = parseHtml(result.value, title, "docx");
    } else if (format === "html") parsed = articleUrl ? parseReadableHtml(text, articleUrl) : parseHtml(text, title, "html");
    else if (format === "md") parsed = parseHtml(markdownToHtml(text, name), title, "md");
    else parsed = parsePlainText(text, title);
    return requireReadableContent(parsed);
  } catch (error) {
    throw asImportError(error, "conversion", format);
  }
}

export async function parseFile(file: File): Promise<ParsedBook> {
  const hint = fileTypeHint(file.name, file.type);
  validateImportSize(file.size, hint);
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); }
  catch (error) { throw asImportError(error, "read", hint); }
  return parseDocument(buffer, file.name, file.type);
}

function contentUrl(url: URL): URL {
  const transformed = new URL(url.toString());
  const host = transformed.hostname.toLowerCase();
  const segments = transformed.pathname.split("/").filter(Boolean);
  if (
    (host === "reddit.com" || host.endsWith(".reddit.com"))
    && host !== "embed.reddit.com"
    && segments.includes("comments")
  ) {
    transformed.protocol = "https:";
    transformed.hostname = "embed.reddit.com";
    transformed.search = "";
    transformed.hash = "";
    return transformed;
  }
  if (host === "github.com" && segments.length >= 5 && segments[2] === "blob") {
    transformed.hostname = "raw.githubusercontent.com";
    transformed.port = "";
    transformed.pathname = `/${segments[0]}/${segments[1]}/${segments.slice(3).join("/")}`;
    transformed.search = "";
    transformed.hash = "";
  }
  return transformed;
}

function publicUrl(value: string): URL {
  try {
    const trimmed = value.trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new ImportError("Enter a valid public web address.", "unsupported", "invalid_url", "validation");
  }
}

export function urlFileTypeHint(rawUrl: string): ImportFileType {
  try { return fileTypeHint(publicUrl(rawUrl).pathname); } catch { return "unknown"; }
}

function responseName(response: Response, url: URL): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  try {
    return decodeURIComponent(encoded ?? plain?.[1] ?? plain?.[2]?.trim() ?? url.pathname.split("/").pop() ?? "");
  } catch {
    return url.pathname.split("/").pop() ?? "";
  }
}

async function readDownload(response: Response, fileType: ImportFileType): Promise<ArrayBuffer> {
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_IMPORT_BYTES) {
    await response.body?.cancel();
    validateImportSize(length, fileType);
  }
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) {
        await reader.cancel();
        validateImportSize(size, fileType);
      }
      chunks.push(value);
    }
    return await new Blob(chunks).arrayBuffer();
  } finally {
    reader.releaseLock();
  }
}

export async function parseWebLink(rawUrl: string): Promise<{ parsed: ParsedBook; sourceUrl: string }> {
  const sourceUrl = contentUrl(publicUrl(rawUrl));
  let fileType = fileTypeHint(sourceUrl.pathname);
  let stage: "direct_fetch" | "conversion" = "direct_fetch";
  try {
    const response = await fetch(sourceUrl, {
      headers: { Accept: "text/html,application/xhtml+xml,text/markdown,text/plain,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.5" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImportError(`The document download failed (HTTP ${response.status}).`, response.status === 401 || response.status === 403 ? "restricted" : "network", "direct_http_error", "direct_fetch", fileType, response.status);
    }
    const resolvedUrl = publicUrl(response.url || sourceUrl.toString());
    const name = responseName(response, resolvedUrl);
    const contentType = response.headers.get("content-type") ?? "";
    fileType = fileTypeHint(name, contentType);
    const buffer = await readDownload(response, fileType);
    stage = "conversion";
    const parsed = await parseDocument(buffer, name, contentType, resolvedUrl);
    return { parsed, sourceUrl: resolvedUrl.toString() };
  } catch (error) {
    const directError = asImportError(error, stage, fileType);
    // The backend extracts articles; it cannot repair a downloaded binary document.
    if (isBinaryFormat(directError.fileType) || directError.category === "file_too_large"
      || (stage === "conversion" && directError.fileType !== "html")) throw directError;
    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl.toString() }),
        signal: AbortSignal.timeout(35_000),
      });
      // Read failures must propagate, while invalid JSON must retain the HTTP status.
      // WebKit's Response.json() can reject with a DOMException named SyntaxError.
      const responseText = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(responseText); } catch { payload = null; }
      if (!response.ok) throw fallbackError(payload, response.status, directError.fileType);
      if (!payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string") {
        throw fallbackError({ error: "invalid_response" }, response.status, directError.fileType);
      }
      const result = payload as { title?: unknown; text: string; source_url?: unknown };
      const title = typeof result.title === "string" && result.title.trim() ? result.title.trim() : sourceUrl.hostname;
      const format = directError.fileType === "md" || directError.fileType === "txt" ? directError.fileType : "html";
      const builder = new BookBuilder();
      builder.chapter(title);
      builder.plainText(result.text);
      let resolvedUrl = sourceUrl;
      if (typeof result.source_url === "string") {
        try { resolvedUrl = publicUrl(result.source_url); } catch { /* retain the validated request URL */ }
      }
      return {
        parsed: requireReadableContent({ title, format, chapters: builder.chapters, blocks: builder.blocks }),
        sourceUrl: resolvedUrl.toString(),
      };
    } catch (error) {
      const failure = asImportError(error, "fallback", directError.fileType);
      throw new ImportError(failure.message, failure.category, failure.code, "fallback", failure.fileType, failure.status, directError);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
