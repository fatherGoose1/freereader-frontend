import type { MobileRequest, MobileResponse } from "./mobileSpeech";

const send = (reply: MobileResponse) => self.postMessage(reply);
let busy = false;
self.onmessage = async (event: MessageEvent<MobileRequest>) => {
  if (busy) { send({ kind: "error", message: "Mobile speech worker is busy." }); return; }
  busy = true;
  try {
    const { text, voice, steps, isHeading, speechSpeed, language, mobile = true } = event.data;
    const status = (message: string, progress?: number) => send({ kind: "status", message, progress });
    const result = mobile
      ? await (await import("./mobileInference")).synthesizeMobile(text, voice, steps, isHeading, speechSpeed, language, status)
      : await (await import("./tts")).synthesize(text, voice, steps, status, isHeading, speechSpeed, language);
    send({ kind: "result", result });
  } catch (error) {
    send({ kind: "error", message: error instanceof Error ? error.message : "Mobile speech generation failed." });
  } finally {
    busy = false;
  }
};
