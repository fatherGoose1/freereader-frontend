import assert from "node:assert/strict";
import test from "node:test";
import { createPhononVoice, deletePhononVoice, listPhononVoices, phononVoiceStatus, speakPhononVoice } from "./phonon";

test("Phonon catalog and quota come from the authenticated account, not browser storage", async (t) => {
  const calls: Array<{ path: string; authorization: string | null; method: string }> = [];
  let uploaded: FormData | undefined;
  let speechBody: unknown;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ path: String(input), authorization: new Headers(init?.headers).get("Authorization"), method: init?.method ?? "GET" });
    if (calls.length === 2) uploaded = init?.body as FormData;
    if (calls.length === 5) speechBody = JSON.parse(init?.body as string);
    if (calls.length === 1) return Response.json({ voices: [], monthly_remaining: 2, stored_remaining: 1, can_clone: true });
    if (calls.length === 2) return Response.json({ id: "voice-1", status: "pending" }, { status: 202 });
    if (calls.length === 3) return Response.json({ id: "voice-1", status: "active" });
    return calls.length === 4 ? Response.json({ deleted: true }) : new Response("audio", { headers: { "Content-Type": "audio/mp4" } });
  });
  assert.equal((await listPhononVoices("account-token")).monthly_remaining, 2);
  const wav = new Blob(["wav"], { type: "audio/wav" });
  assert.equal((await createPhononVoice("account-token", "My voice", wav)).status, "pending");
  assert.equal((await phononVoiceStatus("account-token", "voice-1")).status, "active");
  await deletePhononVoice("account-token", "voice-1");
  await speakPhononVoice("account-token", "voice-1", ["A story"], 1.2);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET", "DELETE", "POST"]);
  assert.ok(calls.every((call) => call.authorization === "Bearer account-token"));
  assert.ok(calls.every((call) => call.path.includes("/api/v1/freereader/phonon/")));
  assert.equal(uploaded?.get("name"), "My voice");
  assert.equal((uploaded?.get("audio") as File).size, wav.size);
  assert.deepEqual(speechBody,
    { voice_id: "voice-1", texts: ["A story"], speed: 1.2 });
});

test("the backend's shared quota errors are shown without a local counter", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "monthly_limit_reached" }, { status: 409 }));
  await assert.rejects(createPhononVoice("token", "Voice", new Blob()), /three monthly voice clones/);
});
