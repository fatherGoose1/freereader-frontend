// Phonon voices and their quota live on the account, shared with the iOS reader.
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

const errors: Record<string, string> = {
  premium_required: "A linked FreeReader Gold subscription is required to clone or use a voice.",
  monthly_limit_reached: "Your three monthly voice clones have been used. They refresh next month.",
  voice_limit_reached: "You have three stored voices. Delete one to make room; this won't restore a monthly credit.",
  invalid_audio: "Select exactly ten seconds of audio and try again.",
  voice_not_found: "This voice is no longer available on your account.",
  phonon_unavailable: "Voice narration is unavailable right now. Please try again.",
};

export async function phononResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const detail = await response.json().catch(() => null) as { error?: unknown } | null;
  throw new Error(typeof detail?.error === "string" ? errors[detail.error] ?? "Voice cloning is unavailable. Please try again." : "Voice cloning is unavailable. Please try again.");
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
