import { MobileSpeechClient, usesMobileSpeech } from "./mobileSpeech";
import type { TtsStatus, Voice } from "./tts";

let mobile: MobileSpeechClient | undefined;

export async function synthesize(text: string, voice: Voice = "M3", steps = 8, status?: TtsStatus, isHeading = false, speechSpeed = 0.9) {
  if (!usesMobileSpeech()) {
    return (await import("./tts")).synthesize(text, voice, steps, status, isHeading, speechSpeed);
  }
  if (!mobile) {
    mobile = new MobileSpeechClient();
    window.addEventListener("pagehide", () => mobile?.stop());
  }
  return mobile.synthesize({ text, voice, steps, isHeading, speechSpeed }, status);
}
