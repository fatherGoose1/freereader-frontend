import type { Metadata } from "next";
import SupportWidget from "./components/SupportWidget";
import GoldAuthReturn from "./components/GoldAuthReturn";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io"),
  title: {
    default: "FreeReader — Text to speech for books and documents",
    template: "%s — FreeReader",
  },
  description:
    "Turn books, documents, and articles into audiobooks. Built for readers with dyslexia and ADHD. Start free with FreeReader's text-to-speech tools in 32 languages.",
  icons: { icon: "/icon.svg?v=3" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<SupportWidget /><GoldAuthReturn /></body>
    </html>
  );
}
