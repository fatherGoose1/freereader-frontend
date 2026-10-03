import Link from "next/link";
import BrandMark from "../components/BrandMark";

function CoffeeButton() {
  return (
    <a className="coffee-button" href="https://buymeacoffee.com/freereader" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
        <path d="M17 9h2a2 2 0 0 1 0 4h-2M8 3v2m5-2v2M3 21h15" />
      </svg>
      Buy me a coffee
    </a>
  );
}

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="site-header">
        <nav className="wrap" aria-label="Main navigation">
          <Link className="brand" href="/">
            <BrandMark />
            <span>FreeReader</span>
          </Link>
          <div className="links">
            <Link href="/#how">Explore tools</Link>
            <Link href="/narration">Video narration</Link>
            <Link href="/#trust">Privacy</Link>
            <Link href="/support">Support</Link>
          </div>
          <div className="header-actions">
            <CoffeeButton />
            <Link className="author-cta" href="/authors/submissions">Publish a book</Link>
          </div>
        </nav>
      </header>
      {children}
      <footer>
        <div className="wrap footer-main">
          <div className="footer-brand">
            <Link className="brand" href="/"><BrandMark /><span>FreeReader</span></Link>
            <p>Text to speech for the books you read and the videos you create.</p>
            <CoffeeButton />
          </div>
          <div className="footer-links">
            <div><strong>Product</strong><Link href="/reader/audiobooks">Audiobook reader</Link><Link href="/narration">Video narration</Link><Link href="/authors/submissions">Author publishing</Link><Link href="/pricing">Pricing</Link><Link href="/#languages-heading">Languages</Link></div>
            <div><strong>Company</strong><Link href="/support">Support</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/copyright">Copyright &amp; rights</Link></div>
          </div>
        </div>
        <div className="wrap footer-bottom"><span>© 2026 Prism Labs LLC</span><span>Made for listening and creating.</span></div>
      </footer>
    </>
  );
}
