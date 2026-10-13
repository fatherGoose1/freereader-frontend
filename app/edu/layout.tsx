import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EduProvider from "./EduProvider";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "FreeReader EDU", description: "School-managed reading and listening assignments.", robots: { index: false, follow: false }, manifest: null, referrer: "no-referrer" };

export default function EduLayout({ children }: { children: React.ReactNode }) {
  if (process.env.EDU_ENABLED !== "true") notFound();
  return <EduProvider host={process.env.EDU_HOST ?? "edu.freereader.io"}>{children}</EduProvider>;
}
