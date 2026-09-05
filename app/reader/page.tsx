import type { Metadata } from "next";
import FreeReaderApp from "./FreeReaderApp";

export const metadata: Metadata = {
  title: "Web App",
  description: "A private, local-first document reader and audiobook player.",
};

export default function ReaderPage() {
  return <FreeReaderApp />;
}
