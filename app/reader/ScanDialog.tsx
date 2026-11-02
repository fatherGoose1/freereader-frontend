"use client";

import { useEffect, useRef, useState } from "react";
import { uploadScan } from "./scanClient";
import type { DocumentVersion } from "../edu/model";
import type { LibraryBook } from "./types";
import styles from "./scan.module.css";

type Result = { document: DocumentVersion } | { book: LibraryBook; pdf: Blob };
type Page = { blob: Blob; url: string };
type Corners = Record<"topLeftCorner" | "topRightCorner" | "bottomLeftCorner" | "bottomRightCorner", { x: number; y: number } | undefined>;
const MAX_SCAN_PAGE_BYTES = 4 * 1024 * 1024 - 8192;
let opencvReady: Promise<void> | undefined;

function loadOpenCV(): Promise<void> {
  return opencvReady ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/scan-opencv.js";
    script.async = true;
    script.onload = async () => {
      try {
        const cv = (window as Window & { cv?: Promise<unknown> | { Mat?: unknown } }).cv;
        if (!cv) throw new Error("OpenCV could not start.");
        (window as Window & { cv?: unknown }).cv = await cv;
        resolve();
      } catch (error) { reject(error); }
    };
    script.onerror = () => reject(new Error("Could not load the page scanner."));
    document.head.appendChild(script);
  }).catch((error) => { opencvReady = undefined; throw error; });
}

async function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) =>
      result ? resolve(result) : reject(new Error("Could not save the page.")), "image/jpeg", quality));
    if (blob.size <= MAX_SCAN_PAGE_BYTES) return blob;
  }
  throw new Error("This photo is too large. Retake it at a lower camera resolution.");
}

async function cleanPage(source: CanvasImageSource, width: number, height: number): Promise<{ cropped: Blob | null; full: Blob }> {
  const scale = Math.min(1, 3200 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const full = await jpeg(canvas);
  await loadOpenCV();
  const scannerModule = await import("jscanify/client");
  const Scanner = scannerModule.default;
  const scanner = new Scanner();
  // Detect on a small frame to limit mobile CPU/memory, then warp the high-res image.
  const detection = document.createElement("canvas");
  const ratio = Math.min(1, 1200 / Math.max(canvas.width, canvas.height));
  detection.width = Math.round(canvas.width * ratio); detection.height = Math.round(canvas.height * ratio);
  detection.getContext("2d")!.drawImage(canvas, 0, 0, detection.width, detection.height);
  const cvApi = (window as unknown as { cv: { imread: (source: HTMLCanvasElement) => { delete: () => void } } }).cv;
  try {
    const mat = cvApi.imread(detection);
    let corners: Corners | null = null;
    try {
      const contour = scanner.findPaperContour(mat);
      if (contour) {
        try { corners = scanner.getCornerPoints(contour); }
        finally { contour.delete(); }
      }
    } finally { mat.delete(); }
    if (!corners || Object.values(corners).some((point) => !point)) return { cropped: null, full };
    const scaled = Object.fromEntries(Object.entries(corners).map(([name, point]) =>
      [name, { x: point!.x / ratio, y: point!.y / ratio }])) as Record<string, { x: number; y: number }>;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const paperWidth = Math.round(Math.max(distance(scaled.topLeftCorner, scaled.topRightCorner), distance(scaled.bottomLeftCorner, scaled.bottomRightCorner)));
    const paperHeight = Math.round(Math.max(distance(scaled.topLeftCorner, scaled.bottomLeftCorner), distance(scaled.topRightCorner, scaled.bottomRightCorner)));
    if (paperWidth < 300 || paperHeight < 300) return { cropped: null, full };
    const extracted = scanner.extractPaper(canvas, paperWidth, paperHeight, scaled);
    return { cropped: extracted ? await jpeg(extracted) : null, full };
  } catch { return { cropped: null, full }; }
}

export default function ScanDialog({ onClose, onComplete, school }: {
  onClose: () => void; onComplete: (result: Result) => Promise<void> | void; school?: { id: string; userId: string };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<Page[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [candidate, setCandidate] = useState<{ cropped: Blob | null; full: Blob } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("Scanned document");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, onClose]);
  useEffect(() => () => { stream.current?.getTracks().forEach((track) => track.stop());
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url)); }, []);
  useEffect(() => { if (!candidate) { setPreview(null); return; }
    const url = URL.createObjectURL(candidate.cropped ?? candidate.full);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [candidate]);

  async function startCamera() {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = media;
      setCamera(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = media; void video.current.play(); } });
    } catch { setError("Camera access is unavailable. Choose photos of your pages instead."); }
  }

  async function process(source: CanvasImageSource, width: number, height: number) {
    setBusy(true); setError(""); setMessage("Detecting page edges on this device…");
    try {
      if (width < 300 || height < 300) throw new Error("Use a clearer, larger photo of the page.");
      setCandidate(await cleanPage(source, width, height));
      setMessage("");
    } catch (error) { setError((error as Error).message); setMessage(""); }
    finally { setBusy(false); }
  }

  async function capture() {
    if (!video.current?.videoWidth) return;
    await process(video.current, video.current.videoWidth, video.current.videoHeight);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (pagesRef.current.length >= 20) { setError("A scan can contain up to 20 pages."); break; }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        await process(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        // Preview each photo before adding it; use one at a time for corrections.
        break;
      } catch { setError("This photo could not be opened."); }
    }
  }

  function accept(blob: Blob) {
    if (blob.size > MAX_SCAN_PAGE_BYTES) { setError("This page is too large. Retake it at a lower resolution."); return; }
    const next = { blob, url: URL.createObjectURL(blob) };
    pagesRef.current = [...pagesRef.current, next];
    setPages(pagesRef.current);
    setCandidate(null);
  }

  async function submit() {
    setBusy(true); setError("");
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    try {
      const result = await uploadScan(pages.map((page) => page.blob), title.trim(), setMessage, school);
      await onComplete(result);
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <div className={styles.backdrop} role="presentation"><section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Scan pages">
    <header><div><h2>Scan pages</h2><p>Photograph each page. Edges are detected and straightened on your device.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close scanner">✕</button></header>
    <label className={styles.title}>Document title<input autoFocus maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
    {camera && <video ref={video} className={styles.video} playsInline muted autoPlay aria-label="Camera preview" />}
    {candidate && <div className={styles.review}>
      {preview && <img src={preview} alt="Detected page preview" />}
      <p>{candidate.cropped ? "Review the automatically cropped and straightened page." : "No page edges were detected. Retake the photo or keep the full image."}</p>
      <div className={styles.actions}>{candidate.cropped && <button type="button" onClick={() => accept(candidate.cropped!)}>Use cropped page</button>}
        <button type="button" onClick={() => accept(candidate.full)}>Keep full image</button>
        <button type="button" onClick={() => setCandidate(null)}>Retake</button></div>
    </div>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || pages.length >= 20} onClick={() => void startCamera()}>{camera ? "Restart camera" : "Open camera"}</button>
      {camera && <button type="button" disabled={busy || !!candidate || pages.length >= 20} onClick={() => void capture()}>Capture page</button>}
      <button type="button" disabled={busy || pages.length >= 20} onClick={() => fileInput.current?.click()}>Choose a photo</button>
      <input ref={fileInput} hidden type="file" accept="image/*" onChange={(event) => { void addPhotos(event.target.files); event.target.value = ""; }} />
    </div>
    {pages.length > 0 && <div className={styles.pages} aria-label="Scanned pages">{pages.map((page, index) => <div key={page.url}><img src={page.url} alt={`Page ${index + 1}`} /><span>Page {index + 1}</span><button type="button" disabled={busy} onClick={() => { URL.revokeObjectURL(page.url); setPages(pages.filter((_, i) => i !== index)); }}>Remove</button></div>)}</div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><span>{pages.length} / 20 pages</span><button type="button" disabled={busy || !pages.length || !!candidate || !title.trim()} onClick={() => void submit()}>{busy ? "Processing…" : "Upload & recognize text"}</button></footer>
  </section></div>;
}
