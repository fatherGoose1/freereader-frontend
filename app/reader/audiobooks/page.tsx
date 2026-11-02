import type { Metadata } from "next";
import FreeReaderApp from "../FreeReaderApp";

export const metadata: Metadata = {
  title: "Audiobook Reader",
  description: "Listen to EPUBs, PDFs, documents, and articles. One free hour of audiobook audio per day; Gold adds unlimited audio and sync across devices.",
  alternates: { canonical: "/reader/audiobooks" },
};

export default function AudiobookReaderPage() {
  return <div className="reader-app-route"><FreeReaderApp /></div>;
}
