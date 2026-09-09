import assert from "node:assert/strict";
import test from "node:test";
import { preprocessKokoroText } from "./kokoroWebInference";

const punctuationToken = { ".": 4, "!": 5, "?": 6 } as const;

test("preserves sentence punctuation for Kokoro and inserts pauses", async () => {
  const spoken: string[] = [];
  const chunks = await preprocessKokoroText("Are you? It ended. Stop!", "en-us", async (text) => {
    spoken.push(text);
    return "tˈɛst";
  });

  assert.deepEqual(spoken, ["Are you", "It ended", "Stop"]);
  assert.deepEqual(chunks.map((chunk) => "silence" in chunk ? chunk.silence : chunk.tokens.at(-1)), [
    punctuationToken["?"], 0.4,
    punctuationToken["."], 0.4,
    punctuationToken["!"], 0.4,
  ]);
});

test("preserves punctuation before closing quotes and brackets", async () => {
  const chunks = await preprocessKokoroText("“Really?” (Yes!)", "en-us", async () => "tˈɛst");

  assert.deepEqual(chunks.map((chunk) => "silence" in chunk ? chunk.silence : chunk.tokens.at(-1)), [
    punctuationToken["?"], 0.4,
    punctuationToken["!"], 0.4,
  ]);
});
