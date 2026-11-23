import { eduFetch } from "../edu/client";
import { currentSessionAccessToken } from "./authToken";
import { decodeCloudDocument } from "./accountSync";
import type { DocumentVersion } from "../edu/model";
import type { LibraryBook } from "./types";

const API = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
type ScanProgress = { id: string; status: "uploading" | "queued" | "processing" | "ready" | "failed";
  processedPages: number; pages: number; error?: string; originalUrl?: string; readingUrl?: string; document?: DocumentVersion };
type PreparedScan = { id: string; uploadUrls: string[] };
type ScanCall = <T>(path: string, init?: RequestInit) => Promise<T>;
export type ScanSchool = { id: string; userId: string };
export type ScanResult = { document: DocumentVersion } | { book: LibraryBook; pdf: Blob };

async function consumer<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await currentSessionAccessToken();
  if (!token) throw new Error("Sign in to scan pages into your library.");
  const response = await fetch(`${API}/api/v1/freereader/scans${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.replaceAll("_", " ") ?? "Scan service is unavailable.");
  return data as T;
}

export async function uploadScanPages(pages: Blob[], prepared: PreparedScan, status: (value: string) => void,
  call: ScanCall, school: boolean): Promise<void> {
  for (let index = 0; index < pages.length; index++) {
    status(`Uploading page ${index + 1} of ${pages.length}…`);
    let uploaded = false;
    try {
      const response = await fetch(prepared.uploadUrls[index], { method: "PUT", body: pages[index],
        headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" },
        credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
      uploaded = response.ok;
    } catch { /* Safari may fail a cross-origin Storage upload before it starts. */ }
    if (!uploaded) {
      status(`Uploading page ${index + 1} through FreeReader…`);
      try {
        await call(school ? `scans/${prepared.id}/pages/${index}` : `/${prepared.id}/pages/${index}`,
          { method: "PUT", body: pages[index], headers: { "Content-Type": "image/jpeg" } });
      } catch (error) {
        throw new Error(`Page ${index + 1} could not be uploaded. ${(error as Error).message}`);
      }
    }
  }
}

export async function uploadScan(pages: Blob[], title: string, status: (value: string) => void, school?: { id: string; userId: string }):
  Promise<ScanResult> {
  const call = <T>(path: string, init?: RequestInit) => school
    ? eduFetch<T>(path.replace(/^\//, ""), school.userId, init)
    : consumer<T>(path, init);
  const base = school ? `schools/${school.id}/scans` : "";
  status("Preparing scan upload…");
  const prepared = await call<PreparedScan>(base, {
    method: "POST", body: JSON.stringify({ title, pages: pages.length }),
  });
  await uploadScanPages(pages, prepared, status, call, Boolean(school));
  status("Building high-resolution PDF and preparing OCR…");
  await call(school ? `scans/${prepared.id}/complete` : `/${prepared.id}/complete`, { method: "POST", body: "{}" });
  return waitForScan(prepared.id, status, school);
}

export async function waitForScan(id: string, status: (value: string) => void, school?: ScanSchool, signal?: AbortSignal): Promise<ScanResult> {
  const call = <T>(path: string) => school ? eduFetch<T>(path, school.userId, { signal }) : consumer<T>(path, { signal });
  for (let attempt = 0; attempt < 360; attempt++) {
    signal?.throwIfAborted();
    const result = await call<ScanProgress>(school ? `scans/${id}` : `/${id}`);
    if (result.status === "failed") throw new Error(result.error?.replaceAll("_", " ") ?? "Text recognition failed.");
    if (result.status === "ready") {
      if (school && result.document) return { document: result.document };
      if (!result.originalUrl || !result.readingUrl) throw new Error("Scan result is incomplete.");
      status("Saving scanned pages to your library…");
      const [original, reading] = await Promise.all([fetch(result.originalUrl, { signal }), fetch(result.readingUrl, { signal })]);
      if (!original.ok || !reading.ok) throw new Error("Could not download the completed scan.");
      return { book: await decodeCloudDocument(await reading.blob()), pdf: await original.blob() };
    }
    status(result.status === "processing" ? `Recognizing text on page ${result.processedPages + 1} of ${result.pages}…` : "Waiting for OCR worker…");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Text recognition is taking longer than expected. Please try again later.");
}

export type MobileScanSession = { id: string; title: string; status: "pending" | "claimed" | "uploading" | "submitted" | "expired" | "cancelled";
  expiresAt: string; scanId?: string; token?: string };

export async function mobileScanOwnerCall(path: string, school?: ScanSchool, init?: RequestInit): Promise<MobileScanSession> {
  return school ? eduFetch(`schools/${school.id}/scans/mobile-sessions${path}`, school.userId, init)
    : consumer(`/mobile-sessions${path}`, init);
}

export class MobileScanError extends Error {
  constructor(readonly status: number, code: string) {
    super(({ mobile_scan_expired: "This scan link has expired or has already been used. Create a new link on your computer.",
      mobile_scan_invalid_link: "This scan link is invalid. Create a new link on your computer.",
      mobile_scan_not_found: "This scan session is no longer available. Create a new link on your computer.",
    } as Record<string, string>)[code] ?? code.replaceAll("_", " "));
  }
}

export async function mobileScanDeviceCall<T>(id: string, token: string, path = "", init?: RequestInit): Promise<T> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid scan link.");
  const response = await fetch(`${API}/api/v1/freereader/scans/mobile/${id}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...init?.headers, Authorization: `Bearer ${token}` },
    cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new MobileScanError(response.status, payload.error ?? "Scan service is unavailable. Please try again.");
  return payload as T;
}

export async function uploadMobileScan(id: string, token: string, pages: Blob[], title: string, status: (value: string) => void) {
  status("Preparing secure upload…");
  await mobileScanDeviceCall(id, token, "/prepare", { method: "POST", body: JSON.stringify({ title, pages: pages.length }) });
  for (let index = 0; index < pages.length; index++) {
    status(`Uploading page ${index + 1} of ${pages.length}…`);
    await mobileScanDeviceCall(id, token, `/pages/${index}`, { method: "PUT", body: pages[index], headers: { "Content-Type": "image/jpeg" } });
  }
  status("Building your PDF and sending it for text recognition…");
  await mobileScanDeviceCall(id, token, "/complete", { method: "POST", body: "{}" });
}

export async function deleteScan(id: string): Promise<void> {
  await consumer(`/${id}`, { method: "DELETE" });
}

export async function downloadScanPdf(id: string): Promise<Blob> {
  const job = await consumer<ScanProgress>(`/${id}`);
  if (job.status !== "ready" || !job.originalUrl) throw new Error("Scanned PDF is unavailable.");
  const response = await fetch(job.originalUrl);
  if (!response.ok) throw new Error("Scanned PDF could not be downloaded.");
  return response.blob();
}
