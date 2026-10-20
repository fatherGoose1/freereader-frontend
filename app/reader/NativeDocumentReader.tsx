"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type Contents from "epubjs/types/contents";
import type Section from "epubjs/types/section";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LibraryBook } from "./types";
import { indexNativeText, matchNativeBlocks, nativeRange, nativeWordRange, pdfPageForBlock, pdfWordRange, type NativeTextIndex } from "./nativeText";
import type { SpokenWord } from "./spokenWord";
import { OPEN_DYSLEXIC_SCALE } from "./readingFont";
import ReaderIcon from "./ReaderIcon";
import styles from "./nativeReader.module.css";

interface Props {
  book: LibraryBook;
  source: Blob;
  textSize: number;
  openDyslexic: boolean;
  spokenWord?: SpokenWord;
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

function setEpubTextSize(rendition: Rendition, size: number, dyslexic: boolean) {
  if (size === 20 && !dyslexic) (rendition.themes as Rendition["themes"] & { removeOverride: (name: string) => void }).removeOverride("font-size");
  else rendition.themes.fontSize(`${size / 20 * (dyslexic ? OPEN_DYSLEXIC_SCALE : 1) * 100}%`);
}

function EpubReader({ book, source, textSize, openDyslexic, spokenWord, onNavigate, onError }: ReaderProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ book: Book; rendition: Rendition; locations: Map<number, EpubLocation> } | null>(null);
  const cursor = useRef(book.position.blockIndex);
  const navigate = useRef(onNavigate);
  const follow = useRef<() => Promise<void>>(async () => {});
  const realign = useRef<() => Promise<void>>(async () => {});
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState({ page: 1, total: 1, atStart: true, atEnd: false });
  const [moving, setMoving] = useState(false);
  const manualNavigation = useRef(false);
  const size = useRef(textSize);
  const word = useRef(spokenWord);
  const fontCss = useRef("");
  cursor.current = book.position.blockIndex;
  word.current = spokenWord;
  navigate.current = onNavigate;

  useEffect(() => {
    let cancelled = false;
    let epub: Book | undefined;
    let rendition: Rendition | undefined;
    let observer: ResizeObserver | undefined;
    let highlighted: string | undefined;
    let highlightedWord: string | undefined;
    let lastFollowed = -1;
    let setupFinished = false;
    let pendingFollow = Promise.resolve();
    const start = async () => {
      const { default: ePub } = await import("epubjs");
      const { default: DOMPurify } = await import("dompurify");
      const bytes = await source.arrayBuffer();
      if (cancelled) return;
      epub = ePub({ replacements: "blobUrl" });
      await epub.open(bytes, "binary");
      await epub.ready;
      if (cancelled || !host.current) return;
      const locations = new Map<number, EpubLocation>();
      const sections: Section[] = [];
      epub.spine.each((section: Section) => sections.push(section));
      // WebKit disables parent-installed link listeners in a no-scripts sandbox.
      // Sanitize before serialization/display, then use a strict CSP to forbid
      // book scripts while allowing the parent's navigation/highlight handlers.
      for (const section of sections) section.hooks.serialize.register((html: string, target: Section) => {
        const clean = DOMPurify.sanitize(target.output || html, { WHOLE_DOCUMENT: true,
          ADD_TAGS: ["link", "style"], FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "base", "meta"],
          FORBID_ATTR: ["srcdoc"], ALLOWED_URI_REGEXP: /^(?:(?:https?|blob):|data:image\/|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i });
        const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' blob: data:; img-src blob: data:; font-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
        target.output = clean.replace(/<head[^>]*>/i, `$&<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      });
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
        allowScriptedContent: true,
      });
      const active = { book: epub, rendition, locations };
      engine.current = active;
      rendition.hooks.content.register((contents: Contents) => {
        contents.document.documentElement.lang ||= book.language ?? "en";
        if (fontCss.current) {
          const style = contents.document.createElement("style");
          style.id = "freereader-open-dyslexic";
          style.textContent = fontCss.current;
          contents.document.head.append(style);
        }
        contents.document.addEventListener("click", (event) => {
          const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
          if (link) {
            // srcdoc/blob chapters have the site's URL as a browser fallback.
            // Never let a relative EPUB href navigate that iframe to a web route.
            event.preventDefault(); event.stopImmediatePropagation();
            const href = link.getAttribute("href") ?? "";
            if (/^https?:\/\//i.test(href)) { window.open(href, "_blank", "noopener,noreferrer"); return; }
            if (!href || /^(?:javascript|data|vbscript|file):/i.test(href)) return;
            const current = sections.find((section) => section.index === contents.sectionIndex);
            if (!current) return;
            try {
              const target = new URL(href, `https://epub.internal/${current.href}`);
              const section = epub!.spine.get(decodeURIComponent(target.pathname.slice(1)))
                || epub!.spine.get(href.split("#")[0] || current.href);
              if (!section) return;
              manualNavigation.current = true;
              void rendition!.display(section.href + target.hash).catch(onError);
            } catch { /* Invalid book links cannot escape into the application. */ }
            return;
          }
          const matches = [...locations].filter(([, target]) => target.section === contents.sectionIndex);
          const element = (event.target as Element).closest("h1,h2,h3,h4,h5,h6,p,li");
          let nearest: { index: number; distance: number } | undefined;
          for (const [index, target] of matches) {
            const range = contents.range(target.cfi);
            if ([...range.getClientRects()].some((rect) => event.clientX >= rect.left && event.clientX <= rect.right
              && event.clientY >= rect.top && event.clientY <= rect.bottom)) {
              navigate.current(index);
              return;
            }
            // EPUB paragraphs can span several narration blocks, and a tap in
            // their whitespace is still a request to start in that section.
            if (!element?.contains(range.startContainer)) continue;
            for (const rect of range.getClientRects()) {
              const distance = Math.abs(event.clientY - Math.max(rect.top, Math.min(event.clientY, rect.bottom)))
                + Math.abs(event.clientX - Math.max(rect.left, Math.min(event.clientX, rect.right)));
              if (!nearest || distance < nearest.distance) nearest = { index, distance };
            }
          }
          if (nearest) navigate.current(nearest.index);
        }, true);
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
        const passage = locations.get(index)?.cfi;
        if (highlighted !== passage) {
          if (highlighted) rendition.annotations.remove(highlighted, "highlight");
          highlighted = passage;
          if (highlighted) rendition.annotations.highlight(highlighted, { blockIndex: index }, undefined, "freereader-highlight", {
            fill: "#7797ef", "fill-opacity": "0.28", "mix-blend-mode": "multiply",
          });
        }
        let nextWord: string | undefined;
        const currentWord = word.current;
        if (passage && currentWord) {
          const contents = (rendition.getContents() as unknown as Contents[]).find((item) => item.sectionIndex === target.section);
          if (contents) {
            const range = nativeWordRange(contents.range(passage), book.blocks[index].text, currentWord);
            if (range) nextWord = contents.cfiFromRange(range);
          }
        }
        if (highlightedWord !== nextWord) {
          if (highlightedWord) rendition.annotations.remove(highlightedWord, "highlight");
          highlightedWord = nextWord;
          if (nextWord) rendition.annotations.highlight(nextWord, {}, undefined, "freereader-spoken-word", {
            fill: "#667df3", "fill-opacity": "0.63", "mix-blend-mode": "multiply",
          });
        }
      };
      // A rapid chapter/seek change must not let an older display overwrite
      // the latest highlight, or leave multiple annotations behind.
      follow.current = () => {
        pendingFollow = pendingFollow.then(followPassage);
        return pendingFollow;
      };
      realign.current = () => {
        lastFollowed = -1;
        return follow.current();
      };
      if (size.current !== 20) setEpubTextSize(rendition, size.current, false);
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
      realign.current = async () => {};
      // Opening/indexing can still be pending when a user switches views.
      // Destroy only after the in-flight setup has finished.
      if (setupFinished) epub?.destroy();
    };
  }, [book.id, source]);

  useEffect(() => {
    if (ready) void follow.current().catch(onError);
  }, [book.position.blockIndex, spokenWord?.start, ready]);
  useEffect(() => {
    size.current = textSize;
    const rendition = engine.current?.rendition;
    if (rendition) {
      setEpubTextSize(rendition, textSize, Boolean(fontCss.current));
      void realign.current().catch(onError);
    }
  }, [textSize]);
  useEffect(() => {
    if (!ready || !openDyslexic) return;
    let cancelled = false;
    const urls: string[] = [];
    const install = async () => {
      const faces = await Promise.all([
        ["Regular", "400", "normal"], ["Bold", "700", "normal"],
        ["Italic", "400", "italic"], ["BoldItalic", "700", "italic"],
      ].map(async ([name, weight, style]) => {
        const response = await fetch(`/fonts/OpenDyslexic-${name}.woff2`);
        if (!response.ok) throw new Error("OpenDyslexic font unavailable");
        const blob = await response.blob();
        if (cancelled) return "";
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return `@font-face { font-family: "FreeReader OpenDyslexic"; src: url("${url}") format("woff2"); font-weight: ${weight}; font-style: ${style}; }`;
      }));
      if (cancelled) return;
      fontCss.current = `${faces.join("\n")} body, body * { font-family: "FreeReader OpenDyslexic", sans-serif !important; }`;
      const current = engine.current?.rendition;
      for (const contents of (current?.getContents() ?? []) as Contents[]) {
        let style = contents.document.getElementById("freereader-open-dyslexic");
        if (!style) {
          style = contents.document.createElement("style");
          style.id = "freereader-open-dyslexic";
          contents.document.head.append(style);
        }
        style.textContent = fontCss.current;
        await contents.document.fonts.load('16px "FreeReader OpenDyslexic"');
        await contents.document.fonts.ready;
      }
      if (!cancelled && current && host.current) {
        setEpubTextSize(current, size.current, true);
        current.resize(host.current.clientWidth, host.current.clientHeight);
        await realign.current();
      }
    };
    void install().catch(() => { /* Original EPUB retains its publisher font if the font cannot load. */ });
    return () => {
      cancelled = true;
      const hadFont = Boolean(fontCss.current);
      fontCss.current = "";
      for (const contents of (engine.current?.rendition.getContents() ?? []) as Contents[]) {
        contents.document.getElementById("freereader-open-dyslexic")?.remove();
      }
      for (const url of urls) URL.revokeObjectURL(url);
      if (hadFont && engine.current && host.current) {
        setEpubTextSize(engine.current.rendition, size.current, false);
        engine.current.rendition.resize(host.current.clientWidth, host.current.clientHeight);
        void realign.current().catch(onError);
      }
    };
  }, [openDyslexic, ready]);

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

function PdfReader({ book, source, textSize, spokenWord, onNavigate, onError }: ReaderProps) {
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
            fitHeight={desktop} textSize={textSize} spokenWord={spokenWord} scrollViewport={viewport} onNavigate={onNavigate} onError={onError} />
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
  spokenWord?: SpokenWord;
  scrollViewport: RefObject<HTMLDivElement | null>;
  onNavigate: (index: number) => void;
  onError: () => void;
}

function PdfPage({ pdf, book, pageNumber, width, height, fitHeight, textSize, spokenWord, scrollViewport, onNavigate, onError }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pageElement = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(0);
  const [rects, setRects] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const [wordRects, setWordRects] = useState<typeof rects>([]);
  const ranges = useRef(new Map<number, Range[]>());
  const textIndex = useRef<NativeTextIndex | null>(null);
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
      textIndex.current = null;
      setRects([]);
      setWordRects([]);
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
      textIndex.current = indexNativeText(layer.current, true);
      ranges.current = matchNativeBlocks(textIndex.current, book.blocks.filter((block) => pdfPageForBlock(book.blocks, block.index) === pageNumber));
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
  useEffect(() => {
    if (!active || !spokenWord || !textIndex.current || !pageElement.current) { setWordRects([]); return; }
    const range = pdfWordRange(textIndex.current, book.blocks.filter((block) => pdfPageForBlock(book.blocks, block.index) === pageNumber), book.position.blockIndex, spokenWord);
    const origin = pageElement.current.getBoundingClientRect();
    setWordRects(range ? [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height })) : []);
  }, [book.position.blockIndex, spokenWord?.start, rendered, active]);

  return <div className={styles.pdfPage} ref={pageElement}>
    <canvas ref={canvas} aria-label={`Original PDF page ${pageNumber}`} />
    <div ref={layer} className={styles.textLayer} onClick={(event) => {
      let nearest: { index: number; distance: number } | undefined;
      for (const [index, fragments] of ranges.current) {
        for (const range of fragments) for (const rect of range.getClientRects()) {
          if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
            onNavigate(index);
            return;
          }
          if (event.clientY < rect.top - 8 || event.clientY > rect.bottom + 8) continue;
          const distance = Math.abs(event.clientX - Math.max(rect.left, Math.min(event.clientX, rect.right)));
          if (!nearest || distance < nearest.distance) nearest = { index, distance };
        }
      }
      if (nearest) onNavigate(nearest.index);
    }} />
    <div className={styles.highlights} aria-label={active ? "Current passage" : undefined} aria-current={active ? "true" : undefined}>
      {rects.map((rect, index) => <span key={index} style={rect} />)}
    </div>
    <div className={styles.wordHighlights} aria-hidden="true">
      {wordRects.map((rect, index) => <span key={index} style={rect} />)}
    </div>
  </div>;
}
