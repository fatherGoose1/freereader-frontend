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
  needsRegeneration?: boolean;
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
  return { ...segment, status: "idle", needsRegeneration: !!segment.audio || !!segment.needsRegeneration, error: undefined, audio: null };
}

export function movePassage(segments: NarrationSegment[], id: string, destination: number): NarrationSegment[] {
  const source = segments.findIndex((segment) => segment.id === id);
  if (source < 0 || !Number.isInteger(destination) || destination < 0 || destination >= segments.length) return segments;
  const reordered = [...segments];
  reordered.splice(destination, 0, ...reordered.splice(source, 1));
  return reordered;
}

export function splitPassage(segments: NarrationSegment[], id: string, offset: number, idFactory = makeId): NarrationSegment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  const segment = segments[index];
  if (!segment || !Number.isInteger(offset)) throw new Error("Place the cursor where you want to split this passage.");
  const before = segment.text.slice(0, offset).trim();
  const after = segment.text.slice(offset).trim();
  if (!before || !after) throw new Error("Place the cursor between two parts of the passage to split it.");
  const relevantTo = (text: string) => segment.pronunciations.filter(({ phrase }) => text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  const first = invalidateSegment({ ...segment, text: before, modelId: null, pauseAfterMs: 0, pronunciations: relevantTo(before) });
  const second = invalidateSegment({ ...segment, id: idFactory(), text: after, modelId: null, pronunciations: relevantTo(after) });
  return [...segments.slice(0, index), first, second, ...segments.slice(index + 1)];
}

export function mergePassages(segments: NarrationSegment[], firstId: string): NarrationSegment[] {
  const index = segments.findIndex((segment) => segment.id === firstId);
  const first = segments[index];
  const second = segments[index + 1];
  if (!first || !second) return segments;
  const firstPhrases = new Set(first.pronunciations.map(({ phrase }) => phrase.toLocaleLowerCase()));
  const merged = invalidateSegment({
    ...first,
    text: `${first.text.trim()} ${second.text.trim()}`.trim(),
    modelId: null,
    pauseAfterMs: second.pauseAfterMs,
    pronunciations: [...first.pronunciations, ...second.pronunciations.filter(({ phrase }) => !firstPhrases.has(phrase.toLocaleLowerCase()))],
    needsRegeneration: !!first.audio || !!second.audio || !!first.needsRegeneration || !!second.needsRegeneration,
  });
  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)];
}

export function spokenText(segment: NarrationSegment): string {
  return applyPronunciations(segment.text, segment.pronunciations);
}
