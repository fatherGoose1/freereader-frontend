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
    </Link>
  );
}
