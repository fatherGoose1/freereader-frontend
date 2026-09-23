import type { Metadata } from "next";
import FreeReaderApp from "../FreeReaderApp";

export const metadata: Metadata = {
  title: "Audiobook Reader",
  description: "A private, local-first document reader and audiobook player.",
};

export default function AudiobookReaderPage() {
  return <div className="reader-app-route"><FreeReaderApp /></div>;
}
