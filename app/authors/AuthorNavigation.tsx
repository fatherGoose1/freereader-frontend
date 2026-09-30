"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AuthorNavigation() {
  const onSubmissionPage = usePathname() === "/authors/submissions";
  return <nav aria-label="Author navigation">
    {!onSubmissionPage && <><Link href="/authors/submissions">Submit a book</Link><Link href="/authors/dashboard">Dashboard</Link></>}
    <Link href="/reader/audiobooks">Reader</Link>
  </nav>;
}
