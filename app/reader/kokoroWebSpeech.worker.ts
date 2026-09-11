import { disposeKokoroWeb, prepareKokoroWebGPU, synthesizeKokoroWeb } from "./kokoroWebInference";
import type { KokoroWebRequest, KokoroWebResponse } from "./kokoroWebSpeech";

let busy = false;
const send = (message: KokoroWebResponse, transfer?: Transferable[]) => self.postMessage(message, { transfer });

self.onmessage = async (event: MessageEvent<KokoroWebRequest>) => {
  if (busy) { send({ kind: "error", message: "Kokoro speech worker is busy." }); return; }
  busy = true;
  try {
    if (event.data.kind === "probe") {
      await prepareKokoroWebGPU(event.data.mobile);
      send({ kind: "ready" });
      return;
    }
    const result = await synthesizeKokoroWeb(event.data.text, event.data.voice, event.data.speechSpeed, event.data.isHeading,
      (message, progress) => send({ kind: "status", message, progress }), event.data.mobile);
    send({ kind: "result", ...result }, [result.audio]);
  } catch (error) {
    await disposeKokoroWeb();
    send({ kind: "error", message: error instanceof Error ? error.message : "Kokoro speech generation failed." });
  } finally {
    busy = false;
  }
};
