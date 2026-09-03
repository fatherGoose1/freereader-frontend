import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with FreeReader, troubleshoot importing and playback, or find answers to common questions.",
  alternates: { canonical: "/support" },
};

export default function Support() {
  return (
    <main className="wrap legal">
      <span className="eyebrow">Support</span>
      <h1>How can we help?</h1>
      <p>
        FreeReader is designed to be simple, free, and private. Start with the
        answers below. If you still need help, use the support link on
        FreeReader&apos;s App Store listing.
      </p>

      <h2>Frequently asked questions</h2>

      <h3>Which file types can I import?</h3>
      <p>
        FreeReader supports EPUB, PDF, and plain text (TXT) files. Import a file
        from your device using the Files picker, and it will appear in your
        library.
      </p>

      <h3>Does FreeReader need an internet connection?</h3>
      <p>
        No. Your documents, their text, and generated audio are processed on
        your iPhone. App Store downloads and updates still require
        Apple&apos;s services.
      </p>

      <h3>Which languages are supported?</h3>
      <p>
        FreeReader supports 31 languages. Available voices may vary by language
        and iOS version.
      </p>

      <h3>Does FreeReader upload my documents?</h3>
      <p>
        No. Your document text, filenames, titles, file paths, and generated
        audio remain on your device. The app sends only limited, content-free
        diagnostics. See the <Link href="/privacy">Privacy Policy</Link> for
        details.
      </p>

      <h3>Can support recover my library or listening progress?</h3>
      <p>
        No. FreeReader has no accounts or cloud storage, so we cannot view or
        restore your documents or progress. Deleting the app removes its local
        data from that device.
      </p>

      <h3>How do I delete my data?</h3>
      <p>
        Remove individual books from your library inside the app, or choose
        &quot;Delete App&quot; in iOS to remove the app and its local data.
        Apple controls device backups through your Apple and iCloud settings.
      </p>

      <h2>Privacy and legal</h2>
      <p>
        Review FreeReader&apos;s <Link href="/privacy">Privacy Policy</Link> and{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>Publisher</h2>
      <p>
        Prism Labs LLC
        <br />
        New Jersey, United States
      </p>
    </main>
  );
}
