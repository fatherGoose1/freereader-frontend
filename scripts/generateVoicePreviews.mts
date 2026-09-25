import { mkdir, readFile, writeFile } from "node:fs/promises";
import { KOKORO_VOICES, isSupertonicVoice, supertonicVoices } from "../app/reader/voices";

const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
if (!token) throw new Error("Set FREEREADER_TTS_API_TOKEN to generate voice previews.");

const directory = new URL("../public/voice-previews/", import.meta.url);
await mkdir(directory, { recursive: true });
const voices = [...KOKORO_VOICES.map(([voice]) => voice), ...supertonicVoices().map(([voice]) => voice)];

for (const voice of voices) {
  const file = new URL(`${voice}.m4a`, directory);
  try {
    if ((await readFile(file)).byteLength > 0) continue;
  } catch { /* Missing preview: generate it below. */ }

  const response = await fetch(`${backend}/api/v1/freereader/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "This is how my voice sounds when I narrate your video.",
      language: "en",
      voice,
      speed: 1,
      ...(isSupertonicVoice(voice) ? { engine: "supertonic", steps: 12 } : {}),
    }),
  });
  if (!response.ok) throw new Error(`${voice}: speech service returned ${response.status} ${await response.text()}`);
  if (!(response.headers.get("Content-Type") ?? "").startsWith("audio/")) {
    throw new Error(`${voice}: speech service returned non-audio content.`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.length) throw new Error(`${voice}: speech service returned empty audio.`);
  await writeFile(file, audio);
  console.log(`Generated ${voice}.m4a (${audio.length} bytes)`);
}
