"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LibraryBook } from "./types";
import type { SpokenWord } from "./spokenWord";
import { OPEN_DYSLEXIC_SCALE } from "./readingFont";
import styles from "./reader.module.css";

const OVERSCAN = 900;
const WORD_HIGHLIGHT = "freereader-spoken-word";

function highlightRegistry() {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined" ? CSS.highlights : null;
}

function blockAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return Math.min(low, offsets.length - 2);
}

export default function ContinuousReader({ book, textSize, openDyslexic, spokenWord, onNavigate, paper, navigationJump }: {
  book: LibraryBook;
  textSize: number;
  openDyslexic: boolean;
  spokenWord?: SpokenWord;
  onNavigate: (index: number) => void;
  paper: boolean;
  navigationJump: { index: number; revision: number } | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const renderedTextSize = textSize * (openDyslexic ? OPEN_DYSLEXIC_SCALE : 1);
  const heights = useRef(new Map<number, number>());
  const measuredFor = useRef({ blocks: book.blocks, renderedTextSize });
  if (measuredFor.current.blocks !== book.blocks || measuredFor.current.renderedTextSize !== renderedTextSize) {
    heights.current.clear();
    measuredFor.current = { blocks: book.blocks, renderedTextSize };
  }
  const frame = useRef<number | null>(null);
  const animation = useRef<{ frame: number; target: number; lastTime: number; kind: "passage" | "word" } | null>(null);
  const follow = useRef<number | null>(book.position.blockIndex);
  const animateFollow = useRef(false);
  const jumpFar = useRef(false);
  const lastPassage = useRef(book.position.blockIndex);
  const automaticTop = useRef<number | null>(null);
  const following = useRef(true);
  const userScrollArmed = useRef(false);
  const lastScrollTop = useRef(0);
  const followedPassage = useRef("");
  const previousFont = useRef({ textSize, openDyslexic });
  const handledNavigationJump = useRef(0);
  const [showResume, setShowResume] = useState(false);
  const [layout, setLayout] = useState({ width: 600, revision: 0 });
  const [visible, setVisible] = useState(() => ({ start: Math.max(0, book.position.blockIndex - 12), end: Math.min(book.blocks.length, book.position.blockIndex + 13) }));

  const offsets = useMemo(() => {
    const result = [0];
    const charsPerLine = Math.max(12, Math.floor(layout.width / (renderedTextSize * 0.52)));
    for (const item of book.blocks) {
      const lines = Math.max(1, Math.ceil(item.text.length / charsPerLine));
      const estimate = item.isHeading ? lines * renderedTextSize * 1.95 + 48 : lines * renderedTextSize * 1.85 + renderedTextSize * 1.3;
      result.push(result[result.length - 1] + (heights.current.get(item.index) ?? estimate));
    }
    return result;
  }, [book.blocks, layout, renderedTextSize]);

  function showAt(top: number) {
    const view = viewport.current;
    if (!view || !book.blocks.length) return;
    const start = blockAt(offsets, Math.max(0, top - OVERSCAN));
    const end = Math.min(book.blocks.length, Math.max(start + 1, blockAt(offsets, top + view.clientHeight + OVERSCAN) + 1));
    setVisible((current) => current.start === start && current.end === end ? current : { start, end });
  }

  function stopAnimation() {
    if (animation.current) cancelAnimationFrame(animation.current.frame);
    animation.current = null;
  }

  function scrollTo(top: number, smooth = false, kind: "passage" | "word" = "passage", allowFarJump = false) {
    const view = viewport.current;
    if (!view) return;
    if (smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const target = Math.max(0, Math.min(top, view.scrollHeight - view.clientHeight));
      if (Math.abs(target - view.scrollTop) < 1) return;
      if (animation.current) {
        animation.current.target = target;
        animation.current.kind = kind;
        return;
      }
      // A direct chapter/seek jump can span an entire book. Start close to it,
      // then ease through the final viewport instead of animating for minutes.
      if (allowFarJump && Math.abs(target - view.scrollTop) > view.clientHeight * 4) {
        view.scrollTop = target - Math.sign(target - view.scrollTop) * view.clientHeight * 1.5;
        automaticTop.current = view.scrollTop;
      }
      const movement = { frame: 0, target, lastTime: performance.now(), kind };
      const tick = (now: number) => {
        if (animation.current !== movement) return;
        const elapsed = Math.min(50, now - movement.lastTime);
        movement.lastTime = now;
        const distance = movement.target - view.scrollTop;
        if (Math.abs(distance) < 1.5) {
          view.scrollTop = movement.target;
          automaticTop.current = view.scrollTop;
          animation.current = null;
          return;
        }
        const step = Math.sign(distance) * Math.min(Math.abs(distance) * (1 - Math.exp(-elapsed / 280)), elapsed * 0.5);
        view.scrollTop += step;
        automaticTop.current = view.scrollTop;
        movement.frame = requestAnimationFrame(tick);
      };
      animation.current = movement;
      movement.frame = requestAnimationFrame(tick);
      return;
    }
    stopAnimation();
    view.scrollTop = top;
    automaticTop.current = view.scrollTop;
  }

  function beginManualScroll() {
    stopAnimation();
    follow.current = null;
    userScrollArmed.current = true;
  }

  function centerOn(index: number) {
    const view = viewport.current;
    if (!view) return 0;
    const row = Array.from(sheet.current?.querySelectorAll<HTMLElement>("[data-block-index]") ?? [])
      .find((element) => Number(element.dataset.blockIndex) === index);
    const passage = row?.querySelector<HTMLElement>("p, h2");
    const text = passage?.firstChild;
    if (spokenWord && text?.nodeType === Node.TEXT_NODE && index === book.position.blockIndex) {
      const range = document.createRange();
      range.setStart(text, Math.min(spokenWord.start, text.textContent?.length ?? 0));
      range.setEnd(text, Math.min(spokenWord.start + spokenWord.length, text.textContent?.length ?? 0));
      const word = range.getBoundingClientRect();
      const bounds = view.getBoundingClientRect();
      return view.scrollTop + (word.top + word.bottom - bounds.top - bounds.bottom) / 2;
    }
    if (row) {
      const rect = row.getBoundingClientRect();
      const bounds = view.getBoundingClientRect();
      return view.scrollTop + (rect.top + rect.bottom - bounds.top - bounds.bottom) / 2;
    }
    return offsets[index] + (offsets[index + 1] - offsets[index]) / 2 - view.clientHeight / 2;
  }

  function resumeFollowing() {
    if (!book.blocks.length) return;
    const index = Math.max(0, Math.min(book.position.blockIndex, book.blocks.length - 1));
    following.current = true;
    userScrollArmed.current = false;
    setShowResume(false);
    follow.current = index;
    animateFollow.current = false;
    jumpFar.current = false;
    lastPassage.current = index;
    followedPassage.current = `${book.id}:${index}:${textSize}:${openDyslexic}`;
    scrollTo(centerOn(index));
    showAt(viewport.current?.scrollTop ?? 0);
  }

  useLayoutEffect(() => {
    const view = viewport.current;
    const content = sheet.current;
    if (!view || !content) return;
    const observer = new ResizeObserver(() => {
      const width = content.clientWidth - parseFloat(getComputedStyle(content).paddingLeft) - parseFloat(getComputedStyle(content).paddingRight);
      if (width > 0) {
        setLayout((previous) => {
          if (Math.abs(previous.width - width) < 1) return previous;
          heights.current.clear();
          return { width, revision: previous.revision + 1 };
        });
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (previousFont.current.textSize === textSize && previousFont.current.openDyslexic === openDyslexic) return;
    previousFont.current = { textSize, openDyslexic };
    stopAnimation();
    following.current = true;
    setShowResume(false);
    userScrollArmed.current = false;
    const index = book.position.blockIndex;
    follow.current = index;
    lastPassage.current = index;
    animateFollow.current = false;
    followedPassage.current = "";
    scrollTo(centerOn(index));
    showAt(viewport.current?.scrollTop ?? 0);
  // Font changes are an explicit request to keep the narrated text in view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textSize, openDyslexic]);

  useEffect(() => {
    if (!openDyslexic) return;
    let cancelled = false;
    void document.fonts.load(`${renderedTextSize}px "FreeReader OpenDyslexic"`).then(() => {
      if (cancelled) return;
      heights.current.clear();
      setLayout((previous) => ({ ...previous, revision: previous.revision + 1 }));
      if (!following.current) return;
      follow.current = book.position.blockIndex;
      animateFollow.current = false;
      scrollTo(centerOn(book.position.blockIndex));
      showAt(viewport.current?.scrollTop ?? 0);
    }).catch(() => { /* Keep the reader usable if a font fails to load. */ });
    return () => { cancelled = true; };
  // Recheck positions after the newly selected face replaces the fallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textSize, openDyslexic]);

  // Follow passage changes, rather than every spoken word or position-save tick.
  // The viewport is the scroll container so the document never jumps to its top.
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view || !book.blocks.length) return;
    const index = Math.max(0, Math.min(book.position.blockIndex, book.blocks.length - 1));
    const passageKey = `${book.id}:${index}:${textSize}:${openDyslexic}`;
    const explicitJump = navigationJump?.index === index && navigationJump.revision !== handledNavigationJump.current;
    if (!following.current && !explicitJump) return;
    if (explicitJump) handledNavigationJump.current = navigationJump.revision;
    animateFollow.current = !explicitJump && followedPassage.current !== "" && passageKey !== followedPassage.current
      && index !== lastPassage.current;
    jumpFar.current = Math.abs(index - lastPassage.current) > 1;
    lastPassage.current = index;
    followedPassage.current = passageKey;
    follow.current = index;
    scrollTo(Math.max(0, offsets[index] + (offsets[index + 1] - offsets[index]) / 2 - view.clientHeight / 2), animateFollow.current, "passage", jumpFar.current);
    showAt(view.scrollTop);
  // Recenter only on a new passage, view mount, or font/layout-size change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.position.blockIndex, textSize, openDyslexic, layout.width, navigationJump?.revision]);

  useLayoutEffect(() => {
    const view = viewport.current;
    const index = follow.current;
    const row = index === null ? null : Array.from(sheet.current?.querySelectorAll<HTMLElement>("[data-block-index]") ?? [])
      .find((element) => Number(element.dataset.blockIndex) === index);
    if (!view || !row || index === null) return;
    const position = centerOn(index);
    scrollTo(position, animateFollow.current, "passage", jumpFar.current);
    // A newly mounted row still has an estimated height. Keep following until
    // ResizeObserver has replaced that estimate, including in WebKit where its
    // measurement arrives after the first layout effect.
    if (heights.current.has(index) && frame.current === null) follow.current = null;
  }, [visible, layout.revision, renderedTextSize]);

  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const observer = new ResizeObserver((entries) => {
      let adjustment = 0;
      let changed = false;
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.blockIndex);
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        const previous = heights.current.get(index) ?? offsets[index + 1] - offsets[index];
        if (Math.abs(previous - height) < 0.5) continue;
        if (offsets[index + 1] <= view.scrollTop) adjustment += height - previous;
        heights.current.set(index, height);
        changed = true;
      }
      if (!changed) return;
      if (adjustment) {
        if (animation.current) animation.current.target += adjustment;
        view.scrollTop += adjustment;
        automaticTop.current = view.scrollTop;
      }
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setLayout((previous) => ({ ...previous, revision: previous.revision + 1 }));
      });
    });
    for (const row of sheet.current?.querySelectorAll<HTMLElement>("[data-block-index]") ?? []) observer.observe(row);
    return () => observer.disconnect();
  }, [visible.start, visible.end, book.id, textSize, openDyslexic, offsets]);

  useEffect(() => {
    showAt(viewport.current?.scrollTop ?? 0);
  // Correct the visible window when estimated heights are replaced by measured heights.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets]);

  useLayoutEffect(() => {
    const view = viewport.current;
    const passage = sheet.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const registry = highlightRegistry();
    registry?.delete(WORD_HIGHLIGHT);
    const overlay = passage?.querySelector<HTMLElement>(`.${styles.wordHighlights}`);
    overlay?.replaceChildren();
    const text = passage?.firstChild;
    if (!view || !spokenWord || !text || text.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    range.setStart(text, Math.min(spokenWord.start, text.textContent?.length ?? 0));
    range.setEnd(text, Math.min(spokenWord.start + spokenWord.length, text.textContent?.length ?? 0));
    if (registry) registry.set(WORD_HIGHLIGHT, new Highlight(range));
    else if (overlay && passage) {
      // Older WebKit versions lack the Highlight API. Paint the word without
      // inserting anything into the text flow or changing its line breaks.
      const origin = passage.getBoundingClientRect();
      for (const rect of range.getClientRects()) {
        const marker = document.createElement("span");
        marker.className = styles.spokenWord;
        marker.textContent = range.toString();
        marker.style.left = `${rect.left - origin.left}px`;
        marker.style.top = `${rect.top - origin.top}px`;
        marker.style.width = `${rect.width}px`;
        marker.style.height = `${rect.height}px`;
        overlay.append(marker);
      }
    }
    const bounds = view.getBoundingClientRect();
    const spoken = range.getBoundingClientRect();
    const center = (spoken.top + spoken.bottom) / 2;
    if (!following.current) return;
    if (animation.current && animation.current.kind !== "word") return;
    // Only advance when the spoken word leaves the middle band. Long passages
    // stay readable without scrolling on every word or snapping to the top.
    if (center < bounds.top + bounds.height * 0.3 || center > bounds.bottom - bounds.height * 0.3) {
      scrollTo(view.scrollTop + center - (bounds.top + bounds.bottom) / 2, true, "word");
    }
  }, [spokenWord?.start, book.position.blockIndex]);

  useEffect(() => {
    // The current CSS bundler cannot parse ::highlight(), so install this
    // browser-native style alongside the reader that owns the named range.
    const style = document.createElement("style");
    style.textContent = `::highlight(${WORD_HIGHLIGHT}) { color: #172f73; background-color: #aabaff; }`;
    document.head.append(style);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      stopAnimation();
      highlightRegistry()?.delete(WORD_HIGHLIGHT);
      style.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className={styles.eReaderArea}>
    <div ref={viewport} className={styles.eReaderViewport} tabIndex={0}
      onWheel={beginManualScroll} onTouchStart={beginManualScroll}
      onPointerDown={(event) => { if (event.target === event.currentTarget) beginManualScroll(); }}
      onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) beginManualScroll(); }}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        if (Math.abs(top - lastScrollTop.current) > 1 && (userScrollArmed.current || automaticTop.current === null || Math.abs(automaticTop.current - top) > 20)) {
          stopAnimation();
          follow.current = null;
          following.current = false;
          setShowResume(true);
        }
        lastScrollTop.current = top;
        automaticTop.current = null;
        userScrollArmed.current = false;
        showAt(top);
      }}>
    <div ref={sheet} className={`${styles.readingText} ${paper ? styles.eReaderPaper : ""} ${openDyslexic ? styles.openDyslexic : ""}`} style={{ fontSize: renderedTextSize }}>
      <div aria-hidden="true" style={{ height: offsets[visible.start] }} />
      {book.blocks.slice(visible.start, visible.end).map((item) => <div key={item.index} data-block-index={item.index} className={item.isHeading ? styles.eReaderHeading : styles.eReaderBlock}>
        {item.isHeading
          ? <h2 aria-current={item.index === book.position.blockIndex ? "true" : undefined} className={item.index === book.position.blockIndex ? styles.currentBlock : ""} onClick={() => onNavigate(item.index)}>{item.text}{item.index === book.position.blockIndex && <span className={styles.wordHighlights} aria-hidden="true" />}</h2>
          : <p aria-current={item.index === book.position.blockIndex ? "true" : undefined} className={item.index === book.position.blockIndex ? styles.currentBlock : ""} onClick={() => onNavigate(item.index)}>{item.text}{item.index === book.position.blockIndex && <span className={styles.wordHighlights} aria-hidden="true" />}</p>}
      </div>)}
      <div aria-hidden="true" style={{ height: offsets[book.blocks.length] - offsets[visible.end] }} />
    </div>
    </div>
    {showResume && <button type="button" className={styles.resumeFollow} onClick={resumeFollowing}>Resume centered scrolling</button>}
  </div>;
}
