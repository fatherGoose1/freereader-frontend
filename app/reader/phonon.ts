// Phonon voices and their quota live on the account, shared with the iOS reader.
import { phononSampleUrl } from "./phononSamples";
const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export interface PhononVoice {
  id: string;
  name: string;
  status: "pending" | "active" | "failed";
  error: string | null;
  created_at: string;
}

export interface PhononCatalog {
  voices: PhononVoice[];
  monthly_remaining: number;
  stored_remaining: number;
  can_clone: boolean;
}

export type VoiceGender = "female" | "male" | "character";

export interface PhononCatalogVoice {
  id: string;
  name: string;
  locale: "US" | "UK" | "Character";
  gender: VoiceGender;
  feeling: string;
  description: string;
  kind: "catalog" | "published";
  preview_url?: string;
}

const errors: Record<string, string> = {
  premium_required: "A linked FreeReader Gold subscription is required to create or use a custom voice.",
  monthly_limit_reached: "Your three monthly custom voices have been used. They refresh next month.",
  voice_limit_reached: "You have three stored custom voices.",
  invalid_audio: "Select exactly ten seconds of audio and try again.",
  voice_not_found: "This voice is no longer available on your account.",
  phonon_unavailable: "Voice narration is unavailable right now. Please try again.",
};

export async function phononResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const detail = await response.json().catch(() => null) as { error?: unknown } | null;
  throw new Error(typeof detail?.error === "string" ? errors[detail.error] ?? "Custom voices are unavailable. Please try again." : "Custom voices are unavailable. Please try again.");
}

export function phononUrl(path: string): string {
  return `${API_BASE}/api/v1/freereader/phonon/${path}`;
}

async function request(path: string, token: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return phononResponse(await fetch(phononUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  }));
}

export async function listPhononVoices(token: string): Promise<PhononCatalog> {
  return await (await request("voices", token)).json() as PhononCatalog;
}

export async function listPhononCatalog(): Promise<PhononCatalogVoice[]> {
  const response = await fetch("/api/phonon-catalog");
  const { voices } = await phononResponse(response).then((result) => result.json()) as { voices: PhononCatalogVoice[] };
  return voices.map((voice) => ({ ...voice, preview_url: voice.kind === "catalog" ? phononSampleUrl(voice.id) : undefined }));
}

export async function createPhononVoice(token: string, name: string, wav: Blob): Promise<PhononVoice> {
  const form = new FormData();
  form.set("name", name);
  form.set("audio", wav, "sample.wav");
  return await (await request("voices", token, { method: "POST", body: form })).json() as PhononVoice;
}

export async function phononVoiceStatus(token: string, id: string): Promise<PhononVoice> {
  return await (await request(`voices/${encodeURIComponent(id)}`, token)).json() as PhononVoice;
}

export async function deletePhononVoice(token: string, id: string): Promise<void> {
  await request(`voices/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}

export function speakPhononVoice(token: string, id: string, texts: string[], speed: number, signal?: AbortSignal): Promise<Response> {
  return request("speech", token, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: id, texts, speed }), signal });
}

export function speakPhononCatalog(token: string, id: string, texts: string[], speed: number, signal?: AbortSignal): Promise<Response> {
  return fetch("/api/phonon-catalog-tts", { method: "POST", signal,
    headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": token },
    body: JSON.stringify({ voice_id: id, texts, speed }) }).then(phononResponse);
}
