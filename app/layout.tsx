import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io"),
  title: {
    default: "FreeReader — Your books, out loud",
    template: "%s — FreeReader",
  },
  description:
    "Turn books, documents, and articles into natural speech. FreeReader supports six file formats and 31 languages, free.",
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" />
              <span>FreeReader</span>
            </Link>
            <div className="links">
              <Link href="/#how">How it works</Link>
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
              <Link className="brand" href="/"><img src="/icon.svg" alt="" /><span>FreeReader</span></Link>
              <p>A focused place to read, listen, and keep going.</p>
            </div>
            <div className="footer-links">
              <div><strong>Product</strong><Link href="/#how">How it works</Link><Link href="/reader">Web app</Link><Link href="/#languages-heading">Languages</Link></div>
              <div><strong>Company</strong><Link href="/support">Support</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
            </div>
          </div>
          <div className="wrap footer-bottom"><span>© 2026 Prism Labs LLC</span><span>Designed for reading without limits.</span></div>
        </footer>
      </body>
    </html>
  );
}
