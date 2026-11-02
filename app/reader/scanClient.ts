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
  Promise<{ document: DocumentVersion } | { book: LibraryBook; pdf: Blob }> {
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
  for (let attempt = 0; attempt < 360; attempt++) {
    const result = await call<ScanProgress>(school ? `scans/${prepared.id}` : `/${prepared.id}`);
    if (result.status === "failed") throw new Error(result.error?.replaceAll("_", " ") ?? "Text recognition failed.");
    if (result.status === "ready") {
      if (school && result.document) return { document: result.document };
      if (!result.originalUrl || !result.readingUrl) throw new Error("Scan result is incomplete.");
      status("Saving scanned pages to your library…");
      const [original, reading] = await Promise.all([fetch(result.originalUrl), fetch(result.readingUrl)]);
      if (!original.ok || !reading.ok) throw new Error("Could not download the completed scan.");
      return { book: await decodeCloudDocument(await reading.blob()), pdf: await original.blob() };
    }
    status(result.status === "processing" ? `Recognizing text on page ${result.processedPages + 1} of ${result.pages}…` : "Waiting for OCR worker…");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Text recognition is taking longer than expected. Please try again later.");
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
