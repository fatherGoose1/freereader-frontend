import { useLayoutEffect, useState, type RefObject } from "react";
import type { SpokenWord } from "./spokenWord";

export type WordHighlightRect = { left: number; top: number; width: number; height: number };
export type EReaderWordOverlay = { text: string; rects: WordHighlightRect[] };

/** Paint over the existing e-reader text node; wrapping a word in an inline element changes line breaks. */
export function useEReaderWordHighlight(
  root: RefObject<HTMLDivElement | null>,
  word: SpokenWord | undefined,
  blockIndex: number | undefined,
  bookId: string | undefined,
  pageStart: number,
  textSize: number,
): EReaderWordOverlay | null {
  const [overlay, setOverlay] = useState<EReaderWordOverlay | null>(null);

  useLayoutEffect(() => {
    if (!word || blockIndex === undefined) { setOverlay(null); return; }

    const container = root.current;
    const passage = container?.querySelector<HTMLElement>(`[data-block-index="${blockIndex}"]`);
    const textNode = passage?.firstChild;
    if (!container || textNode?.nodeType !== Node.TEXT_NODE || word.start < 0 || word.length <= 0
      || word.start + word.length > (textNode.textContent?.length ?? 0)) { setOverlay(null); return; }

    const range = document.createRange();
    range.setStart(textNode, word.start);
    range.setEnd(textNode, word.start + word.length);
    const measure = () => {
      const origin = container.getBoundingClientRect();
      setOverlay({
        text: range.toString(),
        rects: Array.from(range.getClientRects(), (rect) => ({
          left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height,
        })),
      });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    return () => { observer?.disconnect(); };
  }, [root, word?.start, word?.length, blockIndex, bookId, pageStart, textSize]);

  return overlay;
}
