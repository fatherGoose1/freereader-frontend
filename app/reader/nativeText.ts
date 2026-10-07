import type { TextBlock } from "./types";

export interface NativeTextIndex {
  text: string;
  points: { node: Text; offset: number }[];
}

/** Normalized text with a reverse map, without changing the publisher's DOM. */
export function indexNativeText(root: Node, separateNodes = false): NativeTextIndex {
  const document = root.ownerDocument!;
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const points: NativeTextIndex["points"] = [];
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node.parentElement?.closest("script,style,noscript,[hidden],[aria-hidden='true']"))) continue;
    const value = node.textContent ?? "";
    if (separateNodes && text && !text.endsWith(" ") && value && !/^\s/.test(value)) {
      text += " ";
      points.push({ node: node as Text, offset: 0 });
    }
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = /\s/.test(value[offset]) ? " " : value[offset];
      if (character === " " && (!text || text.endsWith(" "))) continue;
      text += character;
      points.push({ node: node as Text, offset });
    }
  }
  return { text, points };
}

export function nativeRange(index: NativeTextIndex, start: number, length: number): Range | undefined {
  const first = index.points[start];
  const last = index.points[start + length - 1];
  if (!first || !last) return;
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

export function pdfPageForBlock(blocks: TextBlock[], index: number): number {
  if (blocks[index]?.page) return blocks[index].page!;
  // Older PDF imports don't put page numbers on headings.
  return blocks.slice(index + 1).find((block) => block.page)?.page
    ?? [...blocks.slice(0, index)].reverse().find((block) => block.page)?.page ?? 1;
}

export function matchNativeBlocks(index: NativeTextIndex, blocks: TextBlock[]): Map<number, Range> {
  const ranges = new Map<number, Range>();
  let offset = 0;
  for (const block of blocks) {
    const start = index.text.indexOf(block.text, offset);
    if (start < 0) continue;
    const range = nativeRange(index, start, block.text.length);
    if (range) ranges.set(block.index, range);
    offset = start + block.text.length;
  }
  return ranges;
}
