import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSpeech } from "./speechText";
import { matchWordTimings, parseWordTimings, spokenWords, wordAtTime } from "./spokenWord";

test("word positions preserve the original whitespace, punctuation and Unicode", () => {
  const text = "Hello,  世界!\nDon't stop.";
  assert.deepEqual(spokenWords(text).map(({ start, length }) => text.slice(start, start + length)),
    ["Hello,", "世界!", "Don't", "stop."]);
  const cues = matchWordTimings(text, "Hello, 世界! Don't stop.", [[0, .2, 1], [1, 1.2, 2], [2, 2.1, 3], [3, 3.1, 4]]);
  assert.deepEqual(wordAtTime(cues, .5), { start: 0, length: 5 });
  assert.equal(wordAtTime(cues, 3.4)?.start, text.indexOf("stop."));
  assert.equal(wordAtTime(cues, 1.1), undefined);
});

test("only validated model timings highlight words; unsupported or unmatched text has no word cue", () => {
  assert.deepEqual(parseWordTimings([[0, 0, 1], [1, 1, 2]]), [[0, 0, 1], [1, 1, 2]]);
  assert.equal(parseWordTimings([[0, 1, 0]]), undefined);
  assert.equal(parseWordTimings([[1, 0, 1], [1, 1, 2]]), undefined);
  assert.deepEqual(matchWordTimings("Chapter IV", "Chapter 4.", [[1, .5, 1.2]])[0].word, { start: 8, length: 2 });
  assert.deepEqual(matchWordTimings("one — two", "one, two", [[0, 0, 1]]),
    [{ word: { start: 0, length: 3 }, startSeconds: 0, endSeconds: 1 }]);
  assert.equal(wordAtTime([], 1), undefined);
});

test("word timings stay mapped after an em dash joins two displayed words", () => {
  const text = "He was looking up into the sky all the time he was speaking, and this Alice thought decidedly uncivil. “But perhaps he can’t help it,” she said to herself; “his eyes are so very nearly at the top of his head. But at any rate he might answer questions.—How am I to get in?” she repeated, aloud.";
  const spoken = normalizeForSpeech(text);
  const words = spokenWords(spoken);
  const cues = matchWordTimings(text, spoken, words.map((_, index) => [index, index, index + .8]));
  assert.equal(cues.length, words.length);
  const how = cues.find(({ word }) => text.slice(word.start, word.start + word.length) === "How");
  assert.ok(how);
  assert.equal(how.word.start, text.indexOf("How"));
  assert.deepEqual(wordAtTime(cues, how.startSeconds + .2), how.word);
});
