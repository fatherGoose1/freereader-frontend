"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "../reader/supabase";
import { enrollAuthor, publishingError } from "./client";

export function useAuthorSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [enabledUserId, setEnabledUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const client = supabaseClient();
    if (!client) { setReady(true); return; }
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next); setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setEnabledUserId(null);
    setError("");
    if (!session) return;
    let cancelled = false;
    void enrollAuthor().then(() => { if (!cancelled) setEnabledUserId(session.user.id); })
      .catch((e) => { if (!cancelled) setError(publishingError(e)); });
    return () => { cancelled = true; };
  }, [session?.user.id, attempt]);
  return { session, ready, enabled: !!session && enabledUserId === session.user.id, error, retry: () => setAttempt((value) => value + 1) };
}
