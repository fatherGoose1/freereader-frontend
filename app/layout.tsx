import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "./components/BrandMark";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io"),
  title: {
    default: "FreeReader — Text to speech for books and video narration",
    template: "%s — FreeReader",
  },
  description:
    "Turn books, documents, and articles into audiobooks, or create and export video voiceovers from scripts. Start free with FreeReader's text-to-speech tools in 31 languages.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav className="wrap" aria-label="Main navigation">
            <Link className="brand" href="/">
              <BrandMark />
              <span>FreeReader</span>
            </Link>
            <div className="links">
              <Link href="/#how">Explore tools</Link>
              <Link href="/narration">Video narration</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/#trust">Privacy</Link>
              <Link href="/support">Support</Link>
              <Link className="nav-cta" href="/reader">Open app <span>↗</span></Link>
            </div>
          </nav>
        </header>
        {children}
        <footer>
          <div className="wrap footer-main">
            <div className="footer-brand">
              <Link className="brand" href="/"><BrandMark /><span>FreeReader</span></Link>
              <p>Text to speech for the books you read and the videos you create.</p>
            </div>
            <div className="footer-links">
              <div><strong>Product</strong><Link href="/reader/audiobooks">Audiobook reader</Link><Link href="/narration">Video narration</Link><Link href="/pricing">Pricing</Link><Link href="/#languages-heading">Languages</Link></div>
              <div><strong>Company</strong><Link href="/support">Support</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
            </div>
          </div>
          <div className="wrap footer-bottom"><span>© 2026 Prism Labs LLC</span><span>Made for listening and creating.</span></div>
        </footer>
      </body>
    </html>
  );
}
