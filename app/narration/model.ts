import type { NarratorVoice } from "../reader/voices";

export type SegmentGenerationStatus = "idle" | "generating" | "ready" | "error";

export interface PronunciationOverride {
  id: string;
  phrase: string;
  pronunciation: string;
}

export interface GeneratedAudioReference {
  path: string;
  mimeType: string;
  duration: number;
  generatedAt: string;
  voice: NarratorVoice;
  model: string;
  speed: number;
}

export interface NarrationSegment {
  id: string;
  text: string;
  voiceId: NarratorVoice | null;
  modelId: string | null;
  speedOverride: number | null;
  pronunciations: PronunciationOverride[];
  pauseAfterMs: number;
  status: SegmentGenerationStatus;
  error?: string;
  audio: GeneratedAudioReference | null;
}

export interface NarrationProject {
  id: string;
  title: string;
  defaultVoice: NarratorVoice;
  globalSpeed: number;
  segments: NarrationSegment[];
  createdAt: string;
  updatedAt: string;
}

const MAX_SEGMENT_LENGTH = 420;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function splitLongText(text: string, limit = MAX_SEGMENT_LENGTH): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && `${chunk} ${word}`.length > limit) {
      chunks.push(chunk);
      chunk = word;
    } else {
      chunk = chunk ? `${chunk} ${word}` : word;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function splitParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_SEGMENT_LENGTH) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)
    ?.map((sentence) => sentence.trim()).filter(Boolean) ?? [paragraph];
  const segments: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > MAX_SEGMENT_LENGTH) {
      if (current) segments.push(current);
      segments.push(...splitLongText(sentence));
      current = "";
    } else if (current && `${current} ${sentence}`.length > MAX_SEGMENT_LENGTH) {
      segments.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) segments.push(current);
  return segments;
}

export function segmentScript(script: string, idFactory: () => string = makeId): NarrationSegment[] {
  return script
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(splitParagraph)
    .map((text) => ({
      id: idFactory(),
      text,
      voiceId: null,
      modelId: null,
      speedOverride: null,
      pronunciations: [],
      pauseAfterMs: 250,
      status: "idle" as const,
      audio: null,
    }));
}

export function createNarrationProject(): NarrationProject {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: "Untitled narration",
    defaultVoice: "af_heart",
    globalSpeed: 1,
    segments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyPronunciations(text: string, overrides: PronunciationOverride[]): string {
  const replacements = new Map<string, string>();
  for (const override of overrides) {
    const phrase = override.phrase.trim();
    const pronunciation = override.pronunciation.trim();
    if (phrase && pronunciation) replacements.set(phrase.toLocaleLowerCase(), pronunciation);
  }
  const phrases = [...replacements.keys()].sort((first, second) => second.length - first.length);
  if (!phrases.length) return text;
  const expression = new RegExp(phrases.map(escapeExpression).join("|"), "giu");
  return text.replace(expression, (match) => replacements.get(match.toLocaleLowerCase()) ?? match);
}

export function invalidateSegment(segment: NarrationSegment): NarrationSegment {
  return { ...segment, status: "idle", error: undefined, audio: null };
}

export function spokenText(segment: NarrationSegment): string {
  return applyPronunciations(segment.text, segment.pronunciations);
}
