import type { DocumentFormat } from "./types";
import type { TelemetryProperties } from "./telemetry";

export type ImportFileType = DocumentFormat | "unknown";
export type ImportStage = "validation" | "read" | "detection" | "conversion" | "direct_fetch" | "fallback" | "storage";

export class ImportError extends Error {
  constructor(
    message: string,
    readonly category: string,
    readonly code: string,
    readonly stage: ImportStage,
    public fileType: ImportFileType = "unknown",
    readonly status?: number,
    readonly directError?: ImportError,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ImportError";
  }
}

export function failureCategory(error: unknown): string {
  if (error instanceof ImportError) return error.category;
  const name = error instanceof Error ? error.name : "";
  const text = (error instanceof Error ? error.message : typeof error === "string" ? error : "").toLowerCase();
  if (/TimeoutError|AbortError/.test(name) || /time[ _-]?out|timed out/.test(text)) return "timeout";
  if (/QuotaExceededError|SecurityError/.test(name) || /storage|quota|indexeddb/.test(text)) return "storage";
  if (/PasswordException/.test(name) || /password|encrypted|drm/.test(text)) return "encrypted";
  if (/login|log in|sign in|subscription|subscriber|private|restricted|paywall|forbidden|access.denied/.test(text)) return "restricted";
  if (/larger|limit|too.large/.test(text)) return "file_too_large";
  if (/no.readable|not.contain.enough|insufficient|empty/.test(text)) return "insufficient_content";
  if (/not.configured/.test(text)) return "configuration";
  if (/invalid.backend.response|invalid.response|unexpected token|json/.test(text)) return "invalid_response";
  if (/fetch|network|unavailable|could not be reached|download failed|failed \(/.test(text)) return "network";
  if (/choose an|enter a valid|unsupported|does not provide/.test(text)) return "unsupported";
  if (/parse|readable text|invalid|corrupt|zip/.test(text)) return "conversion";
  return "unknown";
}

export function asImportError(error: unknown, stage: ImportStage, fileType: ImportFileType): ImportError {
  if (error instanceof ImportError) {
    if (error.fileType === "unknown") error.fileType = fileType;
    return error;
  }
  let category = failureCategory(error);
  if (stage === "storage") category = "storage";
  else if (category === "unknown") category = stage === "direct_fetch" || stage === "fallback" ? "network" : "conversion";
  const message = category === "timeout" ? "The import request timed out. Please try again."
    : category === "encrypted" ? "This document is password-protected or encrypted. Import an unlocked copy."
      : category === "storage" ? "The document could not be saved to local browser storage."
        : category === "network" ? "The document could not be downloaded. Try again, or download it and upload the file."
          : "The document could not be parsed. It may be damaged or in an unsupported format.";
  return new ImportError(message, category, `${stage}_${category}`, stage, fileType, undefined, undefined, error);
}

export function importFailureProperties(
  error: unknown,
  context: { source: string; fileType: ImportFileType; stage: ImportStage },
): TelemetryProperties {
  const failure = asImportError(error, context.stage, context.fileType);
  return {
    source: context.source,
    file_type: failure.fileType,
    error_category: failure.category,
    error_code: failure.code,
    error_stage: failure.stage,
    ...(failure.status ? { http_status: failure.status } : {}),
    ...(failure.directError ? {
      direct_error_category: failure.directError.category,
      direct_error_code: failure.directError.code,
      ...(failure.directError.status ? { direct_http_status: failure.directError.status } : {}),
    } : {}),
  };
}

// Backend error messages/codes vary by deployment. Never send response bodies or URLs to telemetry.
export function fallbackError(payload: unknown, status: number, fileType: ImportFileType): ImportError {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const detail = [record.error, record.code, record.error_category].filter((value) => typeof value === "string").join(" ");
  let category = failureCategory(detail);
  if (["timeout", "restricted", "configuration", "insufficient_content", "unsupported", "file_too_large", "invalid_response", "network", "conversion"].includes(String(record.error_category))) {
    category = String(record.error_category);
  }
  if (status === 408 || status === 504) category = "timeout";
  else if (status === 413) category = "file_too_large";
  else if (status === 429) category = "network";
  else if (category === "unknown") {
    category = status === 401 || status === 403 ? "restricted"
      : status === 404 || status === 415 ? "unsupported"
        : status === 422 ? "insufficient_content"
          : status >= 500 ? "network" : "invalid_response";
  }
  const messages: Record<string, string> = {
    timeout: "The article service timed out. Please try again.",
    restricted: "This page requires access or a subscription that the article service could not obtain.",
    configuration: "Browser access failed and the article fallback is not configured. Download the document and upload it, or paste its text.",
    insufficient_content: "The page does not contain enough readable article text.",
    unsupported: "This link could not be read as an article. Download the document and upload it instead.",
    file_too_large: "This document exceeds the import size limit.",
    invalid_response: "The article service returned an invalid response. Please try again.",
    network: "The article service is unavailable. Try again, or paste the article text.",
  };
  return new ImportError(messages[category] ?? messages.invalid_response, category, `fallback_${category}`, "fallback", fileType, status);
}
