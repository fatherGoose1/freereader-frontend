import Link from "next/link";
import BrandMark from "../components/BrandMark";

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
            <Link href="/pricing">Pricing</Link>
            <Link href="/#trust">Privacy</Link>
            <Link href="/support">Support</Link>
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
    </>
  );
}
