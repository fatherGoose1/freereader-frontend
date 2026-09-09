import { MobileSpeechClient, usesMobileSpeech } from "./mobileSpeech";
import { KokoroWebSpeechClient } from "./kokoroWebSpeech";
import { speechEngine, voiceForLanguage, type SpeechLanguage } from "./speech";
import type { TtsStatus } from "./tts";
import { isKokoroVoice, isSupertonicVoice, type NarratorVoice } from "./voices";

let mobile: MobileSpeechClient | undefined;
let kokoro: KokoroWebSpeechClient | undefined;
let pagehideInstalled = false;

export async function synthesize(text: string, voice: NarratorVoice = "af_heart", steps = 8, status?: TtsStatus, isHeading = false, speechSpeed = 0.9, language: SpeechLanguage = "en") {
  const selectedVoice = voiceForLanguage(voice, language);
  if (speechEngine(language) === "kokoro") {
    if (!isKokoroVoice(selectedVoice)) throw new Error("A Kokoro voice is required for English narration.");
    kokoro ??= new KokoroWebSpeechClient();
    if (!pagehideInstalled) {
      pagehideInstalled = true;
      window.addEventListener("pagehide", () => kokoro?.stop());
    }
    return kokoro.synthesize(text, selectedVoice, speechSpeed, isHeading, status, usesMobileSpeech());
  }
  if (!isSupertonicVoice(selectedVoice)) throw new Error("A Supertonic voice is required for this language.");
  if (!usesMobileSpeech()) {
    return (await import("./tts")).synthesize(text, selectedVoice, steps, status, isHeading, speechSpeed, language);
  }
  if (!mobile) {
    mobile = new MobileSpeechClient();
    window.addEventListener("pagehide", () => mobile?.stop());
  }
  return mobile.synthesize({ text, voice: selectedVoice, steps, isHeading, speechSpeed, language }, status);
}
