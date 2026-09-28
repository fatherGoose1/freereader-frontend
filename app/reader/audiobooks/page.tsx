import type { Metadata } from "next";
import FreeReaderApp from "../FreeReaderApp";

export const metadata: Metadata = {
  title: "Audiobook Reader",
  description: "A local-first audiobook reader with optional account sync for your library and reading progress.",
};

export default function AudiobookReaderPage() {
  return <div className="reader-app-route"><FreeReaderApp /></div>;
}
