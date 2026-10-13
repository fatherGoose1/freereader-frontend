import assert from "node:assert/strict";
import test from "node:test";
import { matchWordTimings, parseWordTimings, spokenWords, wordAtTime } from "./spokenWord";

test("word positions preserve the original whitespace, punctuation and Unicode", () => {
  const text = "Hello,  世界!\nDon't stop.";
  assert.deepEqual(spokenWords(text).map(({ start, length }) => text.slice(start, start + length)),
    ["Hello,", "世界!", "Don't", "stop."]);
  const cues = matchWordTimings(text, "Hello, 世界! Don't stop.", [[0, .2, 1], [1, 1.2, 2], [2, 2.1, 3], [3, 3.1, 4]]);
  assert.deepEqual(wordAtTime(cues, .5), { start: 0, length: 6 });
  assert.equal(wordAtTime(cues, 3.4)?.start, text.indexOf("stop."));
  assert.equal(wordAtTime(cues, 1.1), undefined);
});

test("only validated model timings highlight words; unsupported or unmatched text has no word cue", () => {
  assert.deepEqual(parseWordTimings([[0, 0, 1], [1, 1, 2]]), [[0, 0, 1], [1, 1, 2]]);
  assert.equal(parseWordTimings([[0, 1, 0]]), undefined);
  assert.equal(parseWordTimings([[1, 0, 1], [1, 1, 2]]), undefined);
  assert.deepEqual(matchWordTimings("Chapter IV", "Chapter 4.", [[1, .5, 1.2]])[0].word, { start: 8, length: 2 });
  assert.deepEqual(matchWordTimings("one — two", "one, two", [[0, 0, 1]]), []);
  assert.equal(wordAtTime([], 1), undefined);
});
