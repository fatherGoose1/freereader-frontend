"use client";

import { useEffect, useRef, useState } from "react";
import { uploadScan } from "./scanClient";
import MobileScanHandoff from "./MobileScanHandoff";
import { pauseConsumerAnalyticsForEdu } from "../../lib/edu-analytics-boundary";
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
    const timeout = setTimeout(() => reject(new Error("Page detection took too long.")), 15000);
    script.src = "/scan-opencv.js";
    script.async = true;
    script.onload = async () => {
      try {
        const cv = (window as Window & { cv?: Promise<unknown> | { Mat?: unknown } }).cv;
        if (!cv) throw new Error("OpenCV could not start.");
        (window as Window & { cv?: unknown }).cv = await cv;
        resolve();
      } catch (error) { reject(error); }
      finally { clearTimeout(timeout); }
    };
    script.onerror = () => { clearTimeout(timeout); reject(new Error("Could not load the page scanner.")); };
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
  try {
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

export default function ScanDialog({ onClose, onComplete, school, mobile }: {
  onClose: () => void; onComplete: (result: Result) => Promise<void> | void; school?: { id: string; userId: string };
  mobile?: { title: string; expiresAt: string; onSubmit: (pages: Blob[], title: string, status: (message: string) => void) => Promise<void> };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoQueue = useRef<File[]>([]);
  const [queued, setQueued] = useState(0);
  const pagesRef = useRef<Page[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [candidate, setCandidate] = useState<{ cropped: Blob | null; full: Blob } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState(mobile?.title ?? "Scanned document");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [locked, setLocked] = useState(false);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => pauseConsumerAnalyticsForEdu(), []);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled):not([hidden])") ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
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
      return true;
    } catch (error) { setError((error as Error).message); setMessage(""); return false; }
    finally { setBusy(false); }
  }

  async function capture() {
    if (!video.current?.videoWidth) return;
    await process(video.current, video.current.videoWidth, video.current.videoHeight);
  }

  async function nextPhoto() {
    if (photoQueue.current.length) setBusy(true);
    while (photoQueue.current.length && pagesRef.current.length < 20) {
      const file = photoQueue.current.shift()!;
      setQueued(photoQueue.current.length);
      const url = URL.createObjectURL(file);
      try {
        if (file.size > 30 * 1024 * 1024) throw new Error("Photo too large.");
        const image = new Image(); image.src = url;
        await image.decode();
        if (await process(image, image.naturalWidth, image.naturalHeight)) return;
      } catch { setError("This photo could not be opened. Try a JPEG or PNG image."); }
      finally { URL.revokeObjectURL(url); }
    }
    photoQueue.current = []; setQueued(0);
    setBusy(false);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const available = 20 - pagesRef.current.length;
    photoQueue.current = Array.from(files).slice(0, available);
    if (files.length > available) setError("A scan can contain up to 20 pages. Only the first available pages were selected.");
    await nextPhoto();
  }

  function accept(blob: Blob) {
    if (pagesRef.current.length >= 20) return;
    if (blob.size > MAX_SCAN_PAGE_BYTES) { setError("This page is too large. Retake it at a lower resolution."); return; }
    const next = { blob, url: URL.createObjectURL(blob) };
    pagesRef.current = [...pagesRef.current, next];
    setPages(pagesRef.current);
    setCandidate(null);
    void nextPhoto();
  }

  async function submit() {
    setBusy(true); setError("");
    if (mobile) setLocked(true);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    try {
      if (mobile) await mobile.onSubmit(pages.map((page) => page.blob), title.trim(), setMessage);
      else {
        const result = await uploadScan(pages.map((page) => page.blob), title.trim(), setMessage, school);
        await onComplete(result);
      }
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <div className={styles.backdrop} role="presentation"><section ref={dialog} className={`${styles.dialog} ph-no-capture ph-mask`} role="dialog" aria-modal="true" aria-label="Scan pages">
    <header><div><h2>Scan pages</h2><p>Photograph each page. Edges are detected and straightened on your device.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close scanner">✕</button></header>
    {handoff ? <MobileScanHandoff title={title.trim()} school={school} onBack={() => setHandoff(false)} onComplete={async (result) => { await onComplete(result); onClose(); }} /> : <>
    {mobile && <p>Scan up to 20 pages or choose photos. Review them in order, then send them to your computer. Upload before {new Date(mobile.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>}
    <label className={styles.title}>Document title<input autoFocus maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy || locked} /></label>
    {!mobile && !pages.length && !candidate && <div className={styles.phoneOption}><strong>Easier with your phone?</strong><p>Scan a QR code to take photos on your phone and send the document back here.</p><button type="button" disabled={busy || !title.trim()} onClick={() => { stream.current?.getTracks().forEach((track) => track.stop()); setCamera(false); setHandoff(true); }}>Scan with phone</button></div>}
    {camera && <video ref={video} className={styles.video} playsInline muted autoPlay aria-label="Camera preview" />}
    {candidate && <div className={styles.review}>
      {preview && <img src={preview} alt="Detected page preview" />}
      <p>{candidate.cropped ? "Review the automatically cropped and straightened page." : "No page edges were detected. Retake the photo or keep the full image."}</p>
      {queued > 0 && <p>{queued} more {queued === 1 ? "photo" : "photos"} to review</p>}
      <div className={styles.actions}>{candidate.cropped && <button type="button" disabled={busy} onClick={() => accept(candidate.cropped!)}>Use cropped page</button>}
        <button type="button" disabled={busy} onClick={() => accept(candidate.full)}>Keep full image</button>
        <button type="button" disabled={busy} onClick={() => { setCandidate(null); void nextPhoto(); }}>{queued ? "Skip photo" : "Retake"}</button></div>
    </div>}
    <div className={styles.actions}>
      {mobile && <button type="button" disabled={busy || locked || !!candidate || pages.length >= 20} onClick={() => cameraInput.current?.click()}>Take photo</button>}
      <button type="button" disabled={busy || locked || !!candidate || pages.length >= 20} onClick={() => void startCamera()}>{camera ? "Restart camera" : "Open camera"}</button>
      {camera && <button type="button" disabled={busy || locked || !!candidate || pages.length >= 20} onClick={() => void capture()}>Capture page</button>}
      <button type="button" disabled={busy || locked || !!candidate || pages.length >= 20} onClick={() => fileInput.current?.click()}>Choose photos</button>
      <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { void addPhotos(event.target.files); event.target.value = ""; }} />
      <input ref={fileInput} hidden type="file" accept="image/*" multiple onChange={(event) => { void addPhotos(event.target.files); event.target.value = ""; }} />
    </div>
    {pages.length > 0 && <div className={styles.pages} aria-label="Scanned pages">{pages.map((page, index) => <div key={page.url}><img src={page.url} alt={`Page ${index + 1}`} /><span>Page {index + 1}</span><button type="button" disabled={busy || locked || !!candidate} onClick={() => { URL.revokeObjectURL(page.url); pagesRef.current = pages.filter((_, i) => i !== index); setPages(pagesRef.current); }}>Remove</button><button type="button" aria-label={`Move page ${index + 1} earlier`} disabled={busy || locked || !!candidate || index === 0} onClick={() => { const reordered = [...pages]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; setPages(reordered); }}>Move earlier</button></div>)}</div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><span>{pages.length} / 20 pages</span><button type="button" disabled={busy || !pages.length || !!candidate || queued > 0 || !title.trim()} onClick={() => void submit()}>{busy ? "Processing…" : mobile ? "Send to computer" : "Upload & recognize text"}</button></footer>
    </>}
  </section></div>;
}
