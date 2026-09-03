import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "FreeReader keeps your documents and audio on your device and collects only limited, content-free diagnostics.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 3, 2026"
      intro="FreeReader is built to keep your library on your device. This policy explains the limited information the app handles."
    >
      <h2>1. Who we are</h2>
      <p>
        FreeReader is provided by Prism Labs LLC (&ldquo;Prism Labs,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). This Privacy
        Policy explains how information is handled by the FreeReader iOS
        application (the &ldquo;App&rdquo;).
      </p>

      <h2>2. What stays on your device</h2>
      <p>
        FreeReader does not collect, upload, or store the following. This
        information never leaves your device, and we cannot access, recover, or
        provide a copy of it:
      </p>
      <ul>
        <li>your imported documents (EPUBs, PDFs, and text files);</li>
        <li>document text, filenames, titles, or file paths;</li>
        <li>generated audio and playback positions;</li>
        <li>an account, profile, or sign-in credentials; or</li>
        <li>advertising identifiers or tracking data.</li>
      </ul>
      <p>
        Because FreeReader works without an account, we have no way to associate
        your library or listening activity with you.
      </p>

      <h2>3. Limited diagnostics we collect</h2>
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

      <h2>4. How we use diagnostics</h2>
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

      <h2>5. App Store information</h2>
      <p>
        Apple independently processes information when you download or use apps
        through the App Store. Apple may provide us with aggregated or
        de-identified download and performance reports through App Store
        Connect. Apple&apos;s handling of information is governed by its own
        privacy policy.
      </p>

      <h2>6. Retention and deletion</h2>
      <p>
        Your documents and audio remain on your device until you remove them or
        delete the App. Diagnostics are retained only as long as reasonably
        needed to understand product use and diagnose problems. Deleting the App
        resets the installation identifier.
      </p>

      <h2>7. Children&apos;s privacy</h2>
      <p>
        FreeReader is not directed to children under 13, and children under 13
        should not submit any personal information.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy as FreeReader or applicable law
        changes. We will post the updated version here and revise the effective
        date.
      </p>

      <h2>9. Contact</h2>
      <p>
        Prism Labs LLC
        <br />
        New Jersey, United States
      </p>
      <p>
        Questions about this policy may be submitted through the support link on
        FreeReader&apos;s App Store listing.
      </p>
    </LegalPage>
  );
}
