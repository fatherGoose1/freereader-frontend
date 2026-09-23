import type { Metadata } from "next";
import ModeChooser from "./ModeChooser";

export const metadata: Metadata = {
  title: "Choose a Workspace",
  description: "Create an audiobook from reading material or polished narration from a YouTube script.",
};

export default function ReaderPage() {
  return <div className="reader-app-route"><ModeChooser /></div>;
}
