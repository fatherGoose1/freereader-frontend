import { parseFile } from "../reader/importers";
import { encodeCloudDocument } from "../reader/accountSync";
import { detectSpeechLanguage } from "../reader/speech";
import { normalizeForSpeech } from "../reader/speechText";
import { READING_CHUNK_REVISION } from "../reader/readingChunks";
import type { LibraryBook } from "../reader/types";
import { eduFetch, eduHeaders, errorMessage } from "./client";
import type { DocumentVersion } from "./model";
import { recordEduEvent } from "./telemetry";
import { failureCategory } from "../reader/importErrors";
import { fileTypeHint, MAX_IMPORT_BYTES } from "../reader/importFormats";

export async function uploadDocument(schoolId: string, file: File, status: (message: string) => void, userId: string) {
  try { return await performUpload(schoolId, file, status, userId); }
  catch (error) {
    const type = fileTypeHint(file.name, file.type);
    const category = failureCategory(error);
    const supported = ["cancelled", "conversion", "integrity", "network", "storage", "timeout", "unavailable", "unknown", "restricted", "unsupported", "insufficient_content", "file_too_large"];
    recordEduEvent(userId, schoolId, "import_failed", { source: "file", ...(type !== "unknown" ? { file_type: type } : {}), error_category: supported.includes(category) ? category : "unknown" });
    throw error;
  }
}

async function performUpload(schoolId: string, file: File, status: (message: string) => void, userId: string) {
  const started = Date.now();
  const maximum = Math.min(MAX_IMPORT_BYTES, Number(process.env.NEXT_PUBLIC_EDU_MAX_ORIGINAL_BYTES) || MAX_IMPORT_BYTES);
  if (file.size > maximum) throw new Error(`Original documents must be ${Math.floor(maximum / 1024 / 1024)} MiB or smaller.`);
  status(`Reading ${file.name}…`);
  const parsed = await parseFile(file);
  const time = new Date().toISOString();
  const language = parsed.language ?? detectSpeechLanguage(parsed.blocks.map((block) => block.text).join(" ").slice(0, 20_000)) ?? "en";
  const book: LibraryBook & { speechTexts: string[] } = { ...parsed, id: crypto.randomUUID(), language,
    sourceName: file.name, size: file.size, createdAt: time, updatedAt: time, chunkingRevision: READING_CHUNK_REVISION,
    position: { blockIndex: 0, offsetSeconds: 0, speed: 1 },
    speechTexts: parsed.blocks.map((block) => normalizeForSpeech(block.text, block.isHeading, language)) };
  const reading = await encodeCloudDocument(book);
  if (reading.byteLength > 10 * 1024 * 1024) throw new Error("The processed reading copy must be 10 MiB or smaller.");
  const prepared = await eduFetch<{ id: string; originalUploadUrl: string; readingUploadUrl: string }>(`schools/${schoolId}/documents`, userId, {
    method: "POST", body: JSON.stringify({ title: book.title, format: book.format, filename: file.name, originalBytes: file.size, readingBytes: reading.byteLength }),
  });
  status(`Uploading original and reading copy for ${file.name}…`);
  for (const [url, data] of [[prepared.originalUploadUrl, file], [prepared.readingUploadUrl, new Blob([reading], { type: "application/gzip" })]] as const) {
    await eduHeaders(userId);
    const result = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" }, body: data, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
    if (!result.ok) throw new Error("Document upload failed. Retry the upload; this document has not been published.");
  }
  status(`Verifying ${file.name}…`);
  const completed = await eduFetch<{ document: DocumentVersion }>(`documents/${prepared.id}/complete`, userId, { method: "POST", body: "{}" });
  recordEduEvent(userId, schoolId, "import_completed", { source: "file", file_type: book.format, file_size_bytes: file.size,
    block_count: book.blocks.length, chapter_count: book.chapters.length, duration_seconds: (Date.now() - started) / 1000 }, { versionId: completed.document.id });
  return completed.document;
}

export async function checkedDownload(url: string, expected: string, signal: AbortSignal, maximum: number) {
  const response = await fetch(url, { signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
  if (!response.ok) throw new Error(errorMessage("document_download_failed"));
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The document download is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maximum) { await reader.cancel(); throw new Error("The document exceeds the download limit."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== expected) throw new Error("The document failed its integrity check. Please retry.");
  return new Blob([bytes]);
}
