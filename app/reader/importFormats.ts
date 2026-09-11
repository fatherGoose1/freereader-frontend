import JSZip from "jszip";
import { ImportError, type ImportFileType } from "./importErrors";
import type { DocumentFormat } from "./types";

const extensions: Record<string, DocumentFormat> = {
  epub: "epub", pdf: "pdf", docx: "docx", txt: "txt", text: "txt",
  html: "html", htm: "html", xhtml: "html", md: "md", markdown: "md", mdown: "md", mkd: "md",
};
const mimeTypes: Record<string, DocumentFormat> = {
  "application/epub+zip": "epub", "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/html": "html", "application/xhtml+xml": "html", "text/plain": "txt",
  "text/markdown": "md", "text/x-markdown": "md",
};
export const IMPORT_ACCEPT = Object.keys(extensions).map((extension) => `.${extension}`).join(",");
export const MAX_IMPORT_BYTES = 100_000_000;

export function fileTypeHint(name: string, contentType = ""): ImportFileType {
  const extension = extensions[name.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? ""];
  const mime = mimeTypes[contentType.split(";")[0].trim().toLowerCase()];
  return (mime === "txt" ? extension ?? mime : mime ?? extension) ?? "unknown";
}

export function isBinaryFormat(format: ImportFileType): boolean {
  return format === "pdf" || format === "epub" || format === "docx";
}

export function validateImportSize(size: number, fileType: ImportFileType) {
  if (size > MAX_IMPORT_BYTES) throw new ImportError("This document is larger than the 100 MB import limit.", "file_too_large", "file_too_large", "read", fileType);
  if (!size) throw new ImportError("The document is empty.", "insufficient_content", "empty_document", "read", fileType);
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?<!doctype html/i.test(text.slice(0, 2_000))
    || /<\/?(?:p|div|span|br|h[1-6]|ul|ol|li|blockquote|article|section|body|html)\b/i.test(text.slice(0, 2_000));
}

function decodeText(buffer: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buffer);
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be"
      : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "utf-8" : undefined;
  const sample = new TextDecoder("windows-1252").decode(bytes.subarray(0, 2_000));
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]
    ?? sample.match(/<meta\b[^>]*charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1]
    ?? sample.match(/^\s*<\?xml[^>]*encoding=["']([^"']+)/i)?.[1];
  try {
    return new TextDecoder(bom ?? charset ?? "utf-8", { fatal: true }).decode(bytes);
  } catch {
    if (bom || charset) throw new ImportError("The document uses an invalid or unsupported text encoding.", "conversion", "invalid_encoding", "conversion");
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function detectDocument(buffer: ArrayBuffer, name: string, contentType = ""): Promise<{ format: DocumentFormat; text?: string }> {
  const hint = fileTypeHint(name, contentType);
  const bytes = new Uint8Array(buffer);
  // Signatures take priority over download names and generic/misleading MIME types.
  if (new TextDecoder().decode(bytes.subarray(0, 1_024)).includes("%PDF-")) return { format: "pdf" };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buffer); }
    catch { throw new ImportError("The document archive is damaged or incomplete.", "conversion", "invalid_archive", "detection", hint); }
    if (zip.file("META-INF/container.xml")) return { format: "epub" };
    if (zip.file("word/document.xml")) return { format: "docx" };
    throw new ImportError("This archive is not an EPUB or DOCX document.", "unsupported", "unsupported_archive", "detection", hint);
  }
  if (isBinaryFormat(hint)) {
    throw new ImportError(`The download is not a valid ${hint.toUpperCase()} document. It may be an error page or an incomplete file.`, "conversion", "format_mismatch", "detection", hint);
  }
  const text = decodeText(buffer, contentType);
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 8_000))) {
    throw new ImportError("Choose an EPUB, PDF, TXT, DOCX, HTML, or Markdown file.", "unsupported", "unsupported_binary", "detection", hint);
  }
  // Explicit Markdown keeps its rules for embedded/raw HTML.
  if (hint === "md") return { format: "md", text };
  if (looksLikeHtml(text)) return { format: "html", text };
  if (hint !== "unknown") return { format: hint, text };
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const extension = name.split(/[\\/]/).pop()?.match(/\.([^.]+)$/)?.[1].toLowerCase();
  if ((!mime || mime === "application/octet-stream") && (!extension || extension === "bin")) return { format: "txt", text };
  throw new ImportError("Choose an EPUB, PDF, TXT, DOCX, HTML, or Markdown file.", "unsupported", "unsupported_format", "detection");
}
