import { createClient } from "@supabase/supabase-js";
import { BOOK_COLUMNS, PROFILE_COLUMNS, type AuthorProfile, type AuthorBookWithDocument, type AuthorBook, type AuthorSeries } from "../app/authors/model";

// Use only the anonymous key: public routes obey the same publication RLS as readers.
export function publicAuthorClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Author publishing is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getPublicBook(slug: string): Promise<AuthorBookWithDocument | null> {
  const { data, error } = await publicAuthorClient().from("author_books")
    .select(`${BOOK_COLUMNS},document`).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw error;
  return data as AuthorBookWithDocument | null;
}

export async function getPublishedBooks(): Promise<Pick<AuthorBook, "id" | "slug" | "title" | "description" | "author_name" | "cover_path">[]> {
  const { data, error } = await publicAuthorClient().from("author_books")
    .select("id,slug,title,description,author_name,cover_path").eq("status", "published").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPublishedBookAddCounts(): Promise<Map<string, number>> {
  const { data, error } = await publicAuthorClient().rpc("author_book_add_counts");
  if (error) throw error;
  return new Map((data as { book_id: string; additions: number }[]).map((row) => [row.book_id, Number(row.additions)]));
}

export async function getPublicAuthor(slug: string) {
  const client = publicAuthorClient();
  const { data: profile, error } = await client.from("author_profiles").select(PROFILE_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  const [books, series] = await Promise.all([
    client.from("author_books").select(BOOK_COLUMNS).eq("user_id", profile.user_id).eq("status", "published"),
    client.from("author_series").select("id,user_id,name").eq("user_id", profile.user_id),
  ]);
  if (books.error || series.error) throw books.error ?? series.error;
  return { profile: profile as AuthorProfile, books: books.data as AuthorBook[], series: series.data as AuthorSeries[] };
}
