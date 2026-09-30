import Link from "next/link";
import BrandMark from "../components/BrandMark";
import AuthorNavigation from "./AuthorNavigation";
import styles from "./authors.module.css";

export default function AuthorLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/"><BrandMark /><span>FreeReader <small>for authors</small></span></Link>
      <AuthorNavigation />
    </header>
    <main className={styles.main}>{children}</main>
    <footer className={styles.footer}>Free to read. Free to listen. A new way to share your stories.</footer>
  </div>;
}
