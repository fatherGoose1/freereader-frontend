import { supabaseClient } from "../reader/supabase";
import { BOOK_COLUMNS, PROFILE_COLUMNS, type AuthorBook, type AuthorBookWithDocument, type AuthorProfile, type AuthorSeries } from "./model";

export function authorClient() {
  const client = supabaseClient();
  if (!client) throw new Error("Google sign-in is unavailable right now.");
  return client;
}

export async function enrollAuthor() {
  const { error } = await authorClient().rpc("enroll_author");
  if (error) throw new Error("Could not enable publishing. Please try again. " + error.message);
}

export async function loadDashboard(userId: string) {
  const client = authorClient();
  const [profile, books, series] = await Promise.all([
    client.from("author_profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
    client.from("author_books").select(BOOK_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("author_series").select("id,user_id,name").eq("user_id", userId).order("name"),
  ]);
  if (profile.error || books.error || series.error) throw profile.error ?? books.error ?? series.error;
  return { profile: profile.data as AuthorProfile | null, books: books.data as AuthorBook[], series: series.data as AuthorSeries[] };
}

export async function loadAuthorBook(id: string, userId: string) {
  const { data, error } = await authorClient().from("author_books").select(`${BOOK_COLUMNS},document`)
    .eq("id", id).eq("user_id", userId).single();
  if (error) throw error;
  return data as AuthorBookWithDocument;
}

export function publishingError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return "That public profile slug or series book order is already taken. Choose another and try again.";
  if (e.code === "23514") return "Check the book details. Books need readable text, and series order must be a positive whole number.";
  return e.message || "Could not save. Your form is still here. Please try again.";
}

export async function uploadAuthorImage(blob: Blob, userId: string): Promise<string> {
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!extensions[blob.type] || blob.size > 5 * 1024 * 1024) throw new Error("Use a JPG, PNG, or WebP image under 5 MB.");
  const { data } = await authorClient().auth.getSession();
  if (data.session?.user.id !== userId) throw new Error("Sign in with your Google account to upload an image.");
  const response = await fetch("/api/authors/assets", {
    method: "POST", body: blob, headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": blob.type },
  });
  const result = await response.json() as { path?: string; error?: string };
  if (!response.ok || !result.path) throw new Error(result.error || "Image upload failed. Please try again.");
  return result.path;
}
