"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { eduClient, eduFetch, assertSessionActor } from "./client";
import type { School } from "./model";
import styles from "./edu.module.css";
import { recordEduEvent, flushEduEvents } from "./telemetry";
import { pauseConsumerAnalyticsForEdu } from "../../lib/edu-analytics-boundary";
import UiIcon from "./UiIcon";

type EduContext = { session: Session | null; ready: boolean; schools: School[]; school: School | null; userId: string;
  selectSchool: (id: string) => void; refresh: () => Promise<void>; path: (route?: string) => string };
const Context = createContext<EduContext | null>(null);
export function useEdu() { const value = useContext(Context); if (!value) throw new Error("EDU provider required"); return value; }

export default function EduProvider({ children, host }: { children: React.ReactNode; host: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const publicReading = /^(?:\/edu)?\/shared\//.test(pathname);
  const fullScreenReader = publicReading || /\/reader\//.test(pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [error, setError] = useState("");
  const [cleanHost, setCleanHost] = useState(false);
  const launched = useRef(new Set<string>());
  const authUser = useRef("");
  const path = (route = "") => `${cleanHost ? "" : "/edu"}${route ? `/${route.replace(/^\/+/, "")}` : "/"}`;
  useEffect(() => pauseConsumerAnalyticsForEdu(), []);
  async function refresh() {
    const actor = authUser.current;
    const data = await eduFetch<{ schools: School[] }>("session", actor);
    if (authUser.current !== actor) return;
    setSchools(data.schools);
    setSchoolId((current) => data.schools.some((school) => school.id === current) ? current : data.schools[0]?.id ?? "");
    setError("");
  }
  useEffect(() => {
    setCleanHost(window.location.hostname === host);
    if (publicReading) { setSession(null); setSchools([]); setReady(true); return; }
    let alive = true;
    const applySession = (next: Session | null) => {
      if (!alive) return;
      try { if (next) assertSessionActor(next, next.user.id); }
      catch (error) { setSchools([]); setSchoolId(""); authUser.current = ""; setSession(null); setReady(true); setError((error as Error).message); return; }
      if (authUser.current !== (next?.user.id ?? "")) { setSchools([]); setSchoolId(""); }
      authUser.current = next?.user.id ?? "";
      setSession(next); setReady(true);
    };
    try {
      const client = eduClient();
      const { data } = client.auth.onAuthStateChange((_event, next) => {
        applySession(next);
      });
      void client.auth.getSession().then(({ data, error }) => {
        if (!alive) return;
        applySession(data.session);
        if (error) setError(error.message);
      });
      return () => { alive = false; data.subscription.unsubscribe(); };
    } catch (error) { setError((error as Error).message); setReady(true); }
  }, [host, publicReading]);
  useEffect(() => {
    if (!session) { setSchools([]); setSchoolId(""); return; }
    let alive = true;
    void eduFetch<{ schools: School[] }>("session", session.user.id).then((data) => {
      if (!alive) return;
      setSchools(data.schools);
      setSchoolId((current) => data.schools.some((school) => school.id === current) ? current : data.schools[0]?.id ?? "");
      setError("");
    }).catch((error) => { if (alive) { setSchools([]); setError(error.message); } });
    return () => { alive = false; };
  }, [session?.user.id, session?.access_token]);
  async function signIn() {
    try {
      sessionStorage.setItem("freereader-edu-return", `${window.location.pathname}${window.location.search}`);
      const { error } = await eduClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${path("auth/callback")}` } });
      if (error) throw error;
    } catch (error) { setError((error as Error).message); }
  }
  const school = schools.find((school) => school.id === schoolId) ?? null;
  const readingActive = pathname === "/" || pathname === "/edu" || /\/(assignments|classes)(?:\/|$)/.test(pathname);
  useEffect(() => {
    if (!session || !school) return;
    const key = `${session.user.id}:${school.id}`;
    if (!launched.current.has(key)) { launched.current.add(key); recordEduEvent(session.user.id, school.id, "app_launch"); }
    const flush = () => void flushEduEvents(session.user.id, school.id);
    const timer = setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => { clearInterval(timer); window.removeEventListener("online", flush); };
  }, [session?.user.id, school?.id]);
  return <Context.Provider value={{ session, ready, schools, school, userId: session?.user.id ?? "", selectSchool: setSchoolId, refresh, path }}>
    {fullScreenReader && (publicReading || session) ? <div className={styles.readerSurface} data-freereader-product="edu">{publicReading ? children : <div key={session!.user.id}>{children}</div>}</div> : <div className={styles.app} data-freereader-product="edu">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={path()} className={styles.brand} aria-label="FreeReader EDU home"><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /><i /></span><span>FreeReader <small>EDU</small></span></Link>
          {session && <nav aria-label="School navigation"><Link href={path()} className={readingActive ? styles.navActive : ""} aria-current={readingActive ? "page" : undefined}>Assignments</Link><Link href={path("calendar")} className={pathname.endsWith("/calendar") ? styles.navActive : ""} aria-current={pathname.endsWith("/calendar") ? "page" : undefined}>Calendar</Link>{school?.role === "admin" && <Link href={path("admin")} className={pathname.endsWith("/admin") ? styles.navActive : ""} aria-current={pathname.endsWith("/admin") ? "page" : undefined}>School</Link>}</nav>}
          <div className={styles.headerAccount}>
            {schools.length > 1 && <select aria-label="School" value={schoolId} onChange={(event) => { setSchoolId(event.target.value); router.push(path()); }}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select>}
            {session && <details className={styles.accountMenu}><summary aria-label="Account menu"><span className={styles.avatar}>{(session.user.email?.[0] ?? "U").toUpperCase()}</span><UiIcon name="chevron" /></summary><div className={styles.accountPanel}><span className={styles.muted}>{session.user.email}</span><button onClick={async () => { const { error } = await eduClient().auth.signOut({ scope: "local" }); if (error) setError(error.message); }}>Sign out</button></div></details>}
          </div>
        </div>
      </header>
      {error && <div className={styles.error} role="alert">{error}{session && <button onClick={() => void refresh().catch((error) => setError(error.message))}>Retry</button>}</div>}
      {!ready ? <main className={styles.main}><p role="status">Loading your school account…</p></main> : !session ? <main className={styles.main}><section className={`${styles.card} ${styles.signInCard}`}><div className={styles.featureIcon}><UiIcon name="book" /></div><h1>Your reading space</h1><p className={styles.muted}>Sign in to see your school readings and classes.</p><button className={styles.primary} onClick={() => void signIn()}>Sign in with Google <UiIcon name="arrow" /></button></section></main> : <div key={session.user.id}>{children}</div>}
    </div>}
  </Context.Provider>;
}
