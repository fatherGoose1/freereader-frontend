"use client";

import Link from "next/link";
import posthog from "posthog-js";

export default function CtaButton() {
  return (
    <Link
      className="button"
      href="/reader"
      onClick={() => posthog.capture("cta_clicked", { location: "hero" })}
    >
      Open FreeReader
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5" /></svg>
    </Link>
  );
}
