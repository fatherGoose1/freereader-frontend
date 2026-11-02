import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "FreeReader Privacy Policy",
  description:
    "Privacy Policy for FreeReader on iOS, the web, and Chrome.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="FreeReader Privacy Policy"
      updated="October 28, 2026"
      intro="FreeReader is the name used across our iOS app, web reader, and Chrome extension. This policy explains the limited information these products handle."
    >
      <h2>1. Who we are</h2>
      <p>
        FreeReader is provided by Prism Labs LLC (&ldquo;Prism Labs,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). FreeReader is
        the name of our iOS application (the &ldquo;App&rdquo;), our web reader
        (the &ldquo;Website&rdquo;), and our Chrome extension. This Privacy Policy
        explains how the App, Website, and Chrome extension handle information.
      </p>
      <h2>2. Using FreeReader without an account</h2>
      <p>
        The FreeReader iOS App and the anonymous path in the web reader do not
        require an account. Your local library is stored on your device;
        without a Gold subscription, it is not synced to your account. Locally stored
        information includes:
      </p>
      <ul>
        <li>your imported documents (EPUBs, PDFs, and text files);</li>
        <li>document text, filenames, titles, or file paths;</li>
        <li>generated audio; and</li>
        <li>reading progress and playback positions.</li>
      </ul>
      <p>
        Original imported files and generated audio remain on your device.
        Anonymous audiobook libraries stay in this browser until its storage
        is cleared. The web reader sends text passages to our speech service
        when generating audio, even without an account. Direct imports from
        third-party sites contact those sites; when a web page cannot be read
        directly, its URL is sent to our article-extraction service to retrieve
        readable text. The source site may receive your IP address and request
        information under its own privacy policy.
      </p>
      <p>
        The FreeReader Chrome extension processes visible page text locally to
        apply your saved appearance settings while its panel is open. It sends
        readable passages, not the full HTML page, to our speech service only
        when you choose Read page, Read selected text, Start Reading from Here,
        or the selection context menu to generate audio. The extension does
        not save your browsing history or page text to a cloud library. Audio is
        held temporarily for playback. An installation-specific random identifier
        and authentication credential are kept in Chrome extension storage to
        enforce listening limits and subscription access. They survive extension
        updates but may be lost on uninstall. We do not use browser fingerprinting.
      </p>

      <h2>3. Account sign-in and library sync</h2>
      <p>
        You may sign in with Google through Supabase for a Gold subscription
        or to use video narration. If you sign in, we receive your Google
        account identifier, email address, and basic profile information made
        available by Google. With an active Gold subscription, the web reader syncs your parsed documents, folders,
        and reading progress to your account. Video
        narration sends script passages to our speech service to generate audio.
      </p>
      <p>Synced audiobook data may include:</p>
      <ul>
        <li>compressed parsed document text, titles, filenames, source references, and cover images;</li>
        <li>folder organization and document metadata; and</li>
        <li>reading position and playback speed.</li>
      </ul>
      <p>
        Synced content is stored privately using Supabase and is made
        available only to authenticated requests for your account. Generated
        audiobook audio and original source files are not synced. To request
        removal of synced content, contact us through the <a href="/support">support page</a>.
      </p>
      <p>
        Gold can be purchased in the Chrome extension without an account through
        Stripe Checkout. Stripe processes payment details; we receive subscription
        status, a Stripe customer identifier, and the installation identifier to
        grant access. If you optionally connect a verified FreeReader account,
        we associate that subscription with the account for access across devices.
        Without linking, an anonymous purchase may not be recoverable after
        uninstalling the extension. You can manage eligible subscriptions through
        Stripe Customer Portal from the extension.
      </p>

      <h2>4. Limited diagnostics we collect</h2>
      <p>
        The App and Website send technical diagnostics and feature-use events
        so we can maintain and improve them. This may include:
      </p>
      <ul>
        <li>app version and build, and operating-system version;</li>
        <li>broad device class and performance information;</li>
        <li>file type and size categories for imported documents; and</li>
        <li>
          random installation and session identifiers created by the App.
        </li>
      </ul>
      <p>
        Diagnostic events are designed not to include document text, titles,
        filenames, source URLs, or generated audio. They may include document
        identifiers, import source and format, size, feature usage, and error
        categories. The Website also uses PostHog for product analytics.
        Installation identifiers are not Apple advertising or hardware
        identifiers and reset when the App is deleted and reinstalled.
      </p>
      <h2>5. How we use diagnostics</h2>
      <p>We use diagnostics only to:</p>
      <ul>
        <li>keep the App working reliably;</li>
        <li>diagnose crashes and technical problems; and</li>
        <li>understand which features are used so we can improve the App.</li>
      </ul>
      <p>
        We do not sell diagnostics, use them for advertising, or combine them to
        track you across other companies&apos; apps or websites.
      </p>

      <h2>6. Service providers</h2>
      <p>
        We use Supabase for Google authentication, database hosting, and private
        object storage, a speech backend to generate audio from submitted text,
        an article-extraction service for fallback web imports, and PostHog for
        website analytics. Google processes the sign-in flow under Google&apos;s
        own privacy terms. These providers process the data needed to operate
        their respective features on our behalf.
      </p>

      <h2>7. App Store information</h2>
      <p>
        Apple independently processes information when you download or use apps
        through the App Store. Apple may provide us with aggregated or
        de-identified download and performance reports through App Store
        Connect. Apple&apos;s handling of information is governed by its own
        privacy policy.
      </p>

      <h2>8. Retention and deletion</h2>
      <p>
        Local documents and audio remain on your device until you remove them or
        clear the Website or App&apos;s storage. Synced web content remains in
        your account until you delete it or request its removal.
        Diagnostics are retained only as long as reasonably needed to understand
        product use and diagnose problems. Deleting the App resets its
        installation identifier.
      </p>

      <h2>9. Children&apos;s privacy</h2>
      <p>
        The App and Website are not directed to children under 13, and children
        under 13 should not submit any personal information.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy as the App, Website, or applicable law
        changes. We will post the updated version here and revise the effective
        date.
      </p>

      <h2>11. Contact</h2>
      <p>
        Prism Labs LLC
        <br />
        New Jersey, United States
      </p>
      <p>
        Questions about this policy may be submitted through our <a href="/support">support page</a>.
      </p>
    </LegalPage>
  );
}
