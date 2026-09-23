import type { Metadata } from "next";
import NarrationStudio from "./NarrationStudio";

export const metadata: Metadata = {
  title: "YouTube Narration",
  description: "Turn a YouTube script into polished, segment-by-segment narration.",
};

export default function NarrationPage() {
  return <div className="reader-app-route"><NarrationStudio /></div>;
}
