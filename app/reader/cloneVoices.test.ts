import assert from "node:assert/strict";
import test from "node:test";
import { clonedVoiceId, clonedVoiceRef, isClonedVoice } from "./voices";
import { voiceForLanguage } from "./speech";
import { findClonedVoice, listClonedVoices, removeClonedVoice, replaceClonedVoices, saveClonedVoice, voiceRefFor, type ClonedVoiceRecord } from "./cloneVoices";
import { RemoteSpeechClient } from "./remoteSpeech";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function useMemoryWindow() {
  const localStorage = new MemoryStorage();
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = { localStorage };
  return localStorage;
}

function record(id: string, overrides: Partial<ClonedVoiceRecord> = {}): ClonedVoiceRecord {
  return {
    id,
    userId: "user-1",
    name: `Voice ${id}`,
    createdAt: "2026-09-25T00:00:00.000Z",
    durationSeconds: 12.5,
    language: "en",
    ...overrides,
  };
}

test("cloned voice references round-trip and are language-agnostic", () => {
  const ref = clonedVoiceRef("abc123");
  assert.equal(ref, "clone:abc123");
  assert.ok(isClonedVoice(ref));
  assert.equal(isClonedVoice("af_heart"), false);
  assert.equal(clonedVoiceId(ref), "abc123");
  assert.equal(clonedVoiceId("af_heart"), "af_heart");
  assert.equal(voiceForLanguage(ref, "en"), ref);
  assert.equal(voiceForLanguage(ref, "fr"), ref);
});

test("cloned voices persist newest-first, including legacy voices above the new account limit", () => {
  const storage = useMemoryWindow();
  storage.clear();
  for (let index = 0; index < 25; index += 1) saveClonedVoice(record(`v${index}`));
  const saved = listClonedVoices();
  assert.equal(saved.length, 25);
  assert.equal(saved[0].id, "v24");
  assert.equal(findClonedVoice("v24")?.name, "Voice v24");
  assert.equal(findClonedVoice("v0")?.name, "Voice v0");
  assert.deepEqual(replaceClonedVoices([record("remote")]).map(({ id }) => id), ["remote"]);
  assert.equal(findClonedVoice("v24"), undefined);
});

test("saving the same id replaces the existing record", () => {
  const storage = useMemoryWindow();
  storage.clear();
  saveClonedVoice(record("dup", { name: "First" }));
  saveClonedVoice(record("dup", { name: "Second" }));
  const saved = listClonedVoices();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "Second");
  assert.equal(voiceRefFor(saved[0]), "clone:dup");
});

test("removing a clone and reading corrupt storage are safe", () => {
  const storage = useMemoryWindow();
  storage.clear();
  saveClonedVoice(record("keep"));
  saveClonedVoice(record("drop"));
  assert.equal(listClonedVoices().length, 2);
  assert.equal(removeClonedVoice("drop").length, 1);
  assert.equal(findClonedVoice("drop"), undefined);

  storage.setItem("freereaderClonedVoices", "{not json");
  assert.deepEqual(listClonedVoices(), []);
  storage.setItem("freereaderClonedVoices", JSON.stringify([{ id: 1 }, { id: "ok", userId: "u", name: "n", createdAt: "t", durationSeconds: 1 }]));
  assert.equal(listClonedVoices().length, 1);
});

test("clone narration sends delivery instructions separately from spoken text", async (t) => {
  useMemoryWindow();
  saveClonedVoice(record("vox2_voice-1"));
  let payload: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mp4", "X-Audio-Duration": "1.5" } });
  });

  await new RemoteSpeechClient().synthesize("Hello there", 1, false, undefined,
    { voice: "clone:vox2_voice-1", language: "en", steps: 12, instruct: "Speak warmly" });

  assert.equal(payload?.text, "Hello there.");
  assert.equal(payload?.instruct, "Speak warmly");
  assert.equal(payload?.voiceId, "vox2_voice-1");
});
