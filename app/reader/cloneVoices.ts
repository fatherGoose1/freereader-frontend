import { clonedVoiceRef, type ClonedVoice } from "./voices";

// A cloned voice is conditioned once on the GPU and addressed by its Modal voice
// id. The browser only keeps the small metadata record needed to request it.
export interface ClonedVoiceRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  durationSeconds: number;
  language: string | null;
}

const STORAGE_KEY = "freereaderClonedVoices";
const MAX_CLONED_VOICES = 20;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is ClonedVoiceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ClonedVoiceRecord>;
  return typeof record.id === "string" && record.id.length > 0
    && typeof record.userId === "string" && record.userId.length > 0
    && typeof record.name === "string"
    && typeof record.createdAt === "string"
    && typeof record.durationSeconds === "number";
}

export function listClonedVoices(): ClonedVoiceRecord[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function persist(records: ClonedVoiceRecord[]): ClonedVoiceRecord[] {
  const trimmed = records.slice(0, MAX_CLONED_VOICES);
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Private browsing can reject writes; keep the in-memory result anyway.
  }
  return trimmed;
}

export function saveClonedVoice(record: ClonedVoiceRecord): ClonedVoiceRecord[] {
  return persist([record, ...listClonedVoices().filter((existing) => existing.id !== record.id)]);
}

export function removeClonedVoice(id: string): ClonedVoiceRecord[] {
  return persist(listClonedVoices().filter((record) => record.id !== id));
}

export function findClonedVoice(id: string): ClonedVoiceRecord | undefined {
  return listClonedVoices().find((record) => record.id === id);
}

export function voiceRefFor(record: ClonedVoiceRecord): ClonedVoice {
  return clonedVoiceRef(record.id);
}
