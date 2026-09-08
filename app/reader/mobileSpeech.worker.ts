import { synthesizeMobile } from "./mobileInference";
import type { MobileRequest, MobileResponse } from "./mobileSpeech";

const send = (reply: MobileResponse) => self.postMessage(reply);
let busy = false;
self.onmessage = async (event: MessageEvent<MobileRequest>) => {
  if (busy) { send({ kind: "error", message: "Mobile speech worker is busy." }); return; }
  busy = true;
  try {
    const { text, voice, steps, isHeading, speechSpeed, language } = event.data;
    const result = await synthesizeMobile(text, voice, steps, isHeading, speechSpeed, language,
      (message, progress) => send({ kind: "status", message, progress }));
    send({ kind: "result", result });
  } catch (error) {
    send({ kind: "error", message: error instanceof Error ? error.message : "Mobile speech generation failed." });
  } finally {
    busy = false;
  }
};
