import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import EduProvider from "./EduProvider";
import EduGate from "./EduGate";
import { EDU_ACCESS_COOKIE, eduAccessGranted } from "./access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "FreeReader EDU", description: "School-managed reading and listening assignments.", robots: { index: false, follow: false }, manifest: null, referrer: "no-referrer" };

export default async function EduLayout({ children }: { children: React.ReactNode }) {
  if (process.env.EDU_ENABLED !== "true") notFound();
  const store = await cookies();
  if (!eduAccessGranted(store.get(EDU_ACCESS_COOKIE)?.value)) return <EduGate />;
  return <EduProvider host={process.env.EDU_HOST ?? "edu.freereader.io"}>{children}</EduProvider>;
}
