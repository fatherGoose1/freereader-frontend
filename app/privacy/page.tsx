import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "VoiceReader Privacy Policy",
  description:
    "Privacy Policy for the VoiceReader iOS app, also known as FreeReader on the web.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="VoiceReader Privacy Policy"
      updated="September 18, 2026"
      intro="VoiceReader is the iOS app, also known as FreeReader on the web. This policy explains the limited information the App and Website handle."
    >
      <h2>1. Who we are</h2>
      <p>
        VoiceReader is provided by Prism Labs LLC (&ldquo;Prism Labs,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). VoiceReader is
        the name of the iOS application (the &ldquo;App&rdquo;). Its web version
        is known as FreeReader (the &ldquo;Website&rdquo;). This Privacy Policy
        explains how the App and Website handle information.
      </p>

      <h2>2. Using VoiceReader or FreeReader without an account</h2>
      <p>
        The VoiceReader iOS App and the anonymous path in FreeReader do not
        require an account. When you use these paths, the following stays on
        your device and we cannot recover it:
      </p>
      <ul>
        <li>your imported documents (EPUBs, PDFs, and text files);</li>
        <li>document text, filenames, titles, or file paths;</li>
        <li>generated audio and playback positions;</li>
        <li>advertising identifiers or tracking data.</li>
      </ul>
      <p>
        Original imported files, generated audio, and downloaded voice models
        remain on your device even when you use optional web sync.
      </p>

      <h2>3. Optional FreeReader account sync</h2>
      <p>
        FreeReader web users may optionally sign in with Google through
        Supabase. If you sign in, we receive your Google account identifier,
        email address, and basic profile information made available by Google.
        We use this information only to authenticate you and provide account
        sync.
      </p>
      <p>Account sync stores:</p>
      <ul>
        <li>compressed parsed document text, titles, filenames, source references, and cover images;</li>
        <li>folder organization and document metadata; and</li>
        <li>reading position and playback speed.</li>
      </ul>
      <p>
        Synced content is stored privately using Supabase and is made available
        only to authenticated requests for your account. Generated audio and
        voice models are not synced. You can sign out without deleting local
        downloads, or use &ldquo;Delete account and cloud copies&rdquo; in the
        account panel to remove your Supabase account, synced documents,
        folders, and positions.
      </p>

      <h2>4. Limited diagnostics we collect</h2>
      <p>
        The App sends limited, content-free technical diagnostics so we can
        maintain and improve it. This may include:
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
        Diagnostics never contain your document content, titles, or generated
        audio. Installation identifiers are not Apple advertising or hardware
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
        object storage. Google processes the sign-in flow under Google&apos;s own
        privacy terms. These providers process account and synced-content data
        to operate the service on our behalf.
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
        clear the Website or App&apos;s storage. Synced web content remains until
        you delete individual documents or delete your account and cloud copies.
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
        Questions about this policy may be submitted through the support link on
        VoiceReader&apos;s App Store listing.
      </p>
    </LegalPage>
  );
}
