import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FreeReader — Your books, out loud",
    template: "%s — FreeReader",
  },
  description:
    "FreeReader turns EPUBs, PDFs, and text files into audiobooks on your iPhone, for free.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="wrap">
          <nav aria-label="Main navigation">
            <Link className="brand" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" />
              <span>FreeReader</span>
            </Link>
            <div className="links">
              <Link href="/support">Support</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </nav>
        </header>
        {children}
        <footer>
          <div className="wrap footer-row">
            <span>© 2026 FreeReader. Read freely.</span>
            <div className="links">
              <Link href="/support">Support</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/privacy">Privacy Policy</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
