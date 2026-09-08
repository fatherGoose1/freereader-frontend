import { MobileSpeechClient, usesMobileSpeech } from "./mobileSpeech";
import { KokoroWebSpeechClient } from "./kokoroWebSpeech";
import type { TtsStatus } from "./tts";
import { isKokoroVoice, isSupertonicVoice, type NarratorVoice } from "./voices";

let mobile: MobileSpeechClient | undefined;
let kokoro: KokoroWebSpeechClient | undefined;
let pagehideInstalled = false;

export async function synthesize(text: string, voice: NarratorVoice = "af_heart", steps = 8, status?: TtsStatus, isHeading = false, speechSpeed = 0.9) {
  if (isKokoroVoice(voice)) {
    kokoro ??= new KokoroWebSpeechClient();
    if (!pagehideInstalled) {
      pagehideInstalled = true;
      window.addEventListener("pagehide", () => kokoro?.stop());
    }
    return kokoro.synthesize(text, voice, speechSpeed, status);
  }
  if (!isSupertonicVoice(voice)) throw new Error("An unknown narrator voice was selected.");
  if (!usesMobileSpeech()) {
    return (await import("./tts")).synthesize(text, voice, steps, status, isHeading, speechSpeed);
  }
  if (!mobile) {
    mobile = new MobileSpeechClient();
    window.addEventListener("pagehide", () => mobile?.stop());
  }
  return mobile.synthesize({ text, voice, steps, isHeading, speechSpeed }, status);
}
