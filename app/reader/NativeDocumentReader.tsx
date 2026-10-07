"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type Contents from "epubjs/types/contents";
import type Section from "epubjs/types/section";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LibraryBook } from "./types";
import { indexNativeText, matchNativeBlocks, nativeRange, pdfPageForBlock } from "./nativeText";
import ReaderIcon from "./ReaderIcon";
import styles from "./nativeReader.module.css";

interface Props {
  book: LibraryBook;
  source: Blob;
  textSize: number;
  onNavigate: (index: number) => void;
}

export default function NativeDocumentReader(props: Props) {
  const [error, setError] = useState("");
  if (error) return <div className={styles.notice} role="alert">{error} You can continue in E-reader.</div>;
  return props.book.format === "epub"
    ? <EpubReader {...props} onError={() => setError("This EPUB could not be displayed in Original.")} />
    : <PdfReader {...props} onError={() => setError("This PDF could not be displayed in Original.")} />;
}

type ReaderProps = Props & { onError: () => void };
type EpubLocation = { cfi: string; section: number };

function EpubReader({ book, source, textSize, onNavigate, onError }: ReaderProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ book: Book; rendition: Rendition; locations: Map<number, EpubLocation> } | null>(null);
  const cursor = useRef(book.position.blockIndex);
  const navigate = useRef(onNavigate);
  const follow = useRef<() => Promise<void>>(async () => {});
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState({ page: 1, total: 1, atStart: true, atEnd: false });
  const [moving, setMoving] = useState(false);
  const manualNavigation = useRef(false);
  const size = useRef(textSize);
  cursor.current = book.position.blockIndex;
  navigate.current = onNavigate;

  useEffect(() => {
    let cancelled = false;
    let epub: Book | undefined;
    let rendition: Rendition | undefined;
    let observer: ResizeObserver | undefined;
    let highlighted: string | undefined;
    let lastFollowed = -1;
    let setupFinished = false;
    let pendingFollow = Promise.resolve();
    const start = async () => {
      const { default: ePub } = await import("epubjs");
      const bytes = await source.arrayBuffer();
      if (cancelled) return;
      epub = ePub({ replacements: "blobUrl" });
      await epub.open(bytes, "binary");
      await epub.ready;
      if (cancelled || !host.current) return;
      const locations = new Map<number, EpubLocation>();
      const sections: Section[] = [];
      epub.spine.each((section: Section) => sections.push(section));
      let blockCursor = 0;
      // Use the same source elements as the importer; chunk boundaries do not
      // introduce paragraph breaks into the rendered EPUB.
      for (const section of sections) {
        if (cancelled) return;
        await section.load(epub.load.bind(epub));
        for (const element of Array.from(section.document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li"))) {
          const index = indexNativeText(element);
          let offset = 0;
          while (blockCursor < book.blocks.length) {
            const block = book.blocks[blockCursor];
            const start = index.text.indexOf(block.text, offset);
            if (start < 0) {
              // The importer synthesizes a heading for headingless spine items.
              if (offset === 0 && block.isHeading && /^Chapter \d+$/.test(block.text)
                && index.text.includes(book.blocks[blockCursor + 1]?.text ?? "\u0000")) {
                blockCursor += 1;
                continue;
              }
              break;
            }
            const range = nativeRange(index, start, block.text.length);
            if (range) locations.set(block.index, { cfi: section.cfiFromRange(range), section: section.index });
            offset = start + block.text.length;
            blockCursor += 1;
          }
        }
        section.unload();
      }
      if (cancelled) return;
      if (!locations.size) throw new Error("No source passages matched");
      rendition = epub.renderTo(host.current, {
        width: host.current.clientWidth, height: host.current.clientHeight,
        flow: "paginated", spread: "auto", minSpreadWidth: 900,
        allowScriptedContent: false,
      });
      const active = { book: epub, rendition, locations };
      engine.current = active;
      rendition.hooks.content.register((contents: Contents) => {
        contents.document.documentElement.lang ||= book.language ?? "en";
        contents.document.addEventListener("click", (event) => {
          if ((event.target as Element).closest("a")) { manualNavigation.current = true; return; }
          const matches = [...locations].filter(([, target]) => target.section === contents.sectionIndex);
          for (const [index, target] of matches) {
            const range = contents.range(target.cfi);
            if ([...range.getClientRects()].some((rect) => event.clientX >= rect.left && event.clientX <= rect.right
              && event.clientY >= rect.top && event.clientY <= rect.bottom)) {
              navigate.current(index);
              return;
            }
          }
        });
      });
      rendition.on("relocated", (value: Rendition["location"]) => {
        if (cancelled) return;
        setLocation({ page: value.start.displayed.page, total: value.start.displayed.total, atStart: value.atStart, atEnd: value.atEnd });
        if (manualNavigation.current) {
          manualNavigation.current = false;
          const candidates = [...locations].filter(([, target]) => target.section === value.start.index);
          const candidate = candidates.find(([, target]) => rendition!.epubcfi.compare(target.cfi, value.start.cfi) >= 0)
            ?? candidates.at(-1);
          if (candidate && candidate[0] !== cursor.current) {
            lastFollowed = candidate[0];
            navigate.current(candidate[0]);
          }
        }
      });
      const followPassage = async () => {
        if (cancelled || !rendition) return;
        const index = cursor.current;
        const target = locations.get(index) ?? [...locations].find(([candidate]) => candidate >= index)?.[1];
        if (!target) return;
        if (lastFollowed !== index) {
          await rendition.display(target.cfi);
          lastFollowed = index;
        }
        if (cancelled || cursor.current !== index) return;
        if (highlighted) rendition.annotations.remove(highlighted, "highlight");
        highlighted = locations.get(index)?.cfi;
        if (highlighted) rendition.annotations.highlight(highlighted, { blockIndex: index }, undefined, "freereader-highlight", {
          fill: "#7797ef", "fill-opacity": "0.35", "mix-blend-mode": "multiply",
        });
      };
      // A rapid chapter/seek change must not let an older display overwrite
      // the latest highlight, or leave multiple annotations behind.
      follow.current = () => {
        pendingFollow = pendingFollow.then(followPassage);
        return pendingFollow;
      };
      if (size.current !== 20) rendition.themes.fontSize(`${size.current / 20 * 100}%`);
      await follow.current();
      if (cancelled) return;
      setReady(true);
      observer = new ResizeObserver(() => {
        if (host.current && !cancelled) rendition?.resize(host.current.clientWidth, host.current.clientHeight);
      });
      observer.observe(host.current);
    };
    void start().catch(() => { if (!cancelled) onError(); }).finally(() => {
      setupFinished = true;
      if (cancelled) epub?.destroy();
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      engine.current = null;
      follow.current = async () => {};
      // Opening/indexing can still be pending when a user switches views.
      // Destroy only after the in-flight setup has finished.
      if (setupFinished) epub?.destroy();
    };
  }, [book.id, source]);

  useEffect(() => {
    if (ready) void follow.current().catch(onError);
  }, [book.position.blockIndex, ready]);
  useEffect(() => {
    size.current = textSize;
    const rendition = engine.current?.rendition;
    if (rendition) rendition.themes.fontSize(`${textSize / 20 * 100}%`);
  }, [textSize]);

  async function turn(direction: "prev" | "next") {
    setMoving(true);
    manualNavigation.current = true;
    try { await engine.current?.rendition[direction](); }
    catch { onError(); }
    finally { setMoving(false); }
  }
  return <div className={styles.reader} aria-label="Native EPUB reader">
    {!ready && <p className={styles.loading} role="status">Opening original EPUB…</p>}
    <div ref={host} className={styles.epub} />
    <nav className={styles.navigation} aria-label="Original document pages">
      <button disabled={!ready || moving || location.atStart} onClick={() => void turn("prev")}><ReaderIcon name="back" /> Previous</button>
      <span>Chapter page {location.page} of {location.total}</span>
      <button disabled={!ready || moving || location.atEnd} onClick={() => void turn("next")}>Next <ReaderIcon name="arrow" /></button>
    </nav>
  </div>;
}

function PdfReader({ book, source, textSize, onNavigate, onError }: ReaderProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [desktop, setDesktop] = useState(false);
  const pageNumber = pdfPageForBlock(book.blocks, book.position.blockIndex);
  const [viewPage, setViewPage] = useState(pageNumber);
  useEffect(() => setViewPage(pageNumber), [pageNumber]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 801px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const pagesPerSpread = desktop ? 2 : 1;
  const spreadStart = viewPage - (viewPage - 1) % pagesPerSpread;
  const spreadEnd = Math.min(spreadStart + pagesPerSpread - 1, pdf?.numPages ?? spreadStart);
  const pageWidth = Math.max(0, (size.width - (pagesPerSpread - 1) * 16) / pagesPerSpread);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    const open = async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const bytes = await source.arrayBuffer();
      if (cancelled) return;
      task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
      const document = await task.promise;
      if (!cancelled) setPdf(document);
    };
    void open().catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [source]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  function turn(page: number) {
    const block = book.blocks.find((block) => pdfPageForBlock(book.blocks, block.index) === page);
    setViewPage(page);
    if (viewport.current) viewport.current.scrollTo({ top: 0, left: 0 });
    if (block) onNavigate(block.index);
  }
  return <div className={`${styles.reader} ${styles.pdfReader}`} aria-label="Native PDF reader">
    <div className={styles.pdfViewport} ref={viewport}>
      {!pdf && <p className={styles.loading} role="status">Opening original PDF…</p>}
      {pdf && <div className={styles.pdfSpread}>
        {Array.from({ length: spreadEnd - spreadStart + 1 }, (_, index) => spreadStart + index).map((page) => (
          <PdfPage key={page} pdf={pdf} book={book} pageNumber={page} width={pageWidth} height={size.height}
            fitHeight={desktop} textSize={textSize} scrollViewport={viewport} onNavigate={onNavigate} onError={onError} />
        ))}
      </div>}
    </div>
    <nav className={`${styles.navigation} ${styles.pdfNavigation}`} aria-label="Original document pages">
      <button disabled={!pdf || spreadStart <= 1} onClick={() => turn(spreadStart - pagesPerSpread)}><ReaderIcon name="back" /> Previous</button>
      <span>{spreadEnd > spreadStart ? `Pages ${spreadStart}–${spreadEnd}` : `Page ${spreadStart}`} of {pdf?.numPages ?? "…"}</span>
      <button disabled={!pdf || spreadEnd >= pdf.numPages} onClick={() => turn(spreadStart + pagesPerSpread)}>Next <ReaderIcon name="arrow" /></button>
    </nav>
  </div>;
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  book: LibraryBook;
  pageNumber: number;
  width: number;
  height: number;
  fitHeight: boolean;
  textSize: number;
  scrollViewport: RefObject<HTMLDivElement | null>;
  onNavigate: (index: number) => void;
  onError: () => void;
}

function PdfPage({ pdf, book, pageNumber, width, height, fitHeight, textSize, scrollViewport, onNavigate, onError }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pageElement = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(0);
  const [rects, setRects] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const ranges = useRef(new Map<number, Range[]>());
  const active = pdfPageForBlock(book.blocks, book.position.blockIndex) === pageNumber;

  useEffect(() => {
    if (!width || !height) return;
    let cancelled = false;
    let renderTask: ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | undefined;
    let textLayer: import("pdfjs-dist").TextLayer | undefined;
    const render = async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current || !layer.current || !pageElement.current) return;
      const base = page.getViewport({ scale: 1 });
      // Desktop fits the entire portrait spread; mobile fits one page to its
      // width and scrolls vertically. Zoom can enlarge either layout.
      const scale = Math.max(0.01, Math.min(width / base.width, fitHeight ? height / base.height : Infinity)) * textSize / 20;
      const view = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = Math.floor(view.width * ratio);
      canvas.current.height = Math.floor(view.height * ratio);
      canvas.current.style.width = `${view.width}px`;
      canvas.current.style.height = `${view.height}px`;
      pageElement.current.style.width = `${view.width}px`;
      pageElement.current.style.height = `${view.height}px`;
      layer.current.style.setProperty("--scale-factor", String(scale));
      layer.current.replaceChildren();
      ranges.current.clear();
      setRects([]);
      setRendered(0);
      renderTask = page.render({ canvasContext: canvas.current.getContext("2d")!, viewport: view,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      const content = await page.getTextContent({ includeMarkedContent: true });
      if (cancelled) return;
      textLayer = new pdfjs.TextLayer({ textContentSource: content, container: layer.current, viewport: view });
      await Promise.all([renderTask.promise, textLayer.render()]);
      if (cancelled) return;
      for (const index of book.pdfExcludedItems?.[String(pageNumber)] ?? []) {
        textLayer.textDivs[index]?.setAttribute("data-freereader-omit", "true");
      }
      ranges.current = matchNativeBlocks(indexNativeText(layer.current, true), book.blocks.filter((block) => pdfPageForBlock(book.blocks, block.index) === pageNumber));
      setRendered((value) => value + 1);
    };
    void render().catch((error) => { if (!cancelled && error?.name !== "RenderingCancelledException") onError(); });
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, width, height, pageNumber, fitHeight, textSize]);
  useEffect(() => {
    const fragments = ranges.current.get(book.position.blockIndex);
    if (!fragments || !pageElement.current || !scrollViewport.current) { setRects([]); return; }
    const origin = pageElement.current.getBoundingClientRect();
    const boxes = fragments.flatMap((range) => [...range.getClientRects()]).filter((rect) => rect.width > 0 && rect.height > 0);
    setRects(boxes.map((rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height })));
    const first = boxes[0];
    if (first) {
      const bounds = scrollViewport.current.getBoundingClientRect();
      if (first.top < bounds.top || first.bottom > bounds.bottom) scrollViewport.current.scrollTop += first.top - bounds.top - bounds.height / 3;
      if (first.left < bounds.left || first.right > bounds.right) scrollViewport.current.scrollLeft += first.left - bounds.left - 12;
    }
  }, [book.position.blockIndex, rendered]);

  return <div className={styles.pdfPage} ref={pageElement}>
    <canvas ref={canvas} aria-label={`Original PDF page ${pageNumber}`} />
    <div ref={layer} className={styles.textLayer} onClick={(event) => {
      for (const [index, fragments] of ranges.current) {
        if (fragments.some((range) => [...range.getClientRects()].some((rect) => event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom))) { onNavigate(index); break; }
      }
    }} />
    <div className={styles.highlights} aria-label={active ? "Current passage" : undefined} aria-current={active ? "true" : undefined}>
      {rects.map((rect, index) => <span key={index} style={rect} />)}
    </div>
  </div>;
}
