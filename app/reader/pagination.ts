import type { TextBlock } from "./types";

export function readingPageStarts(blocks: TextBlock[], characterLimit: number): number[] {
  const starts: number[] = [];
  let count = 0;
  let characters = 0;
  let previousWasHeading = false;
  for (const block of blocks) {
    const startsHeadingRun = block.isHeading && count > 0 && !previousWasHeading;
    const overflows = count > 0 && characters + block.text.length > characterLimit;
    if (startsHeadingRun || overflows) {
      count = 0;
      characters = 0;
    }
    if (count === 0) starts.push(block.index);
    count += 1;
    characters += block.text.length;
    previousWasHeading = block.isHeading;
  }
  return starts;
}
