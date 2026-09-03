import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of the FreeReader iOS app.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 3, 2026"
      intro="These Terms govern your use of the FreeReader iOS application. By using FreeReader, you agree to these Terms. If you do not agree, do not use the app."
    >
      <h2>1. The service</h2>
      <p>
        FreeReader lets you import supported documents and generate spoken audio
        from their text. The app is provided free of charge and does not require
        an account. Features may change over time.
      </p>

      <h2>2. Your content</h2>
      <p>
        You retain all rights to files you import. You represent that you have
        the right to use that content with FreeReader. FreeReader does not claim
        ownership of your documents or generated audio.
      </p>

      <h2>3. Privacy and local processing</h2>
      <p>
        Your document text, filenames, titles, file paths, and generated audio
        remain on your device and are not uploaded by FreeReader. The app may
        send limited technical diagnostics, such as app and OS versions, device
        class, performance information, file type and size, and random
        installation or session identifiers. These diagnostics do not contain
        document content and are used only to maintain and improve the app. See
        our <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        You may not misuse FreeReader, interfere with its operation, attempt to
        bypass device or platform security, or use it in violation of applicable
        law or another person&apos;s rights.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        Your use of Apple devices and the App Store is also subject to
        Apple&apos;s terms. FreeReader is not responsible for third-party
        services or content.
      </p>

      <h2>6. No warranties</h2>
      <p>
        FreeReader is provided &ldquo;as is&rdquo; and &ldquo;as
        available.&rdquo; To the fullest extent permitted by law, no warranties
        are made regarding availability, accuracy, reliability, fitness for a
        particular purpose, or error-free operation. Generated speech may
        contain mistakes and should not be relied on for critical, medical,
        legal, or safety information.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, FreeReader&apos;s provider will
        not be liable for indirect, incidental, special, consequential, or
        punitive damages, or for loss of data, arising from your use of the app.
        Some jurisdictions do not allow certain limitations, so these
        limitations may not fully apply to you.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using FreeReader at any time by deleting the app. Access
        may be suspended or discontinued if required by law or if these Terms
        are materially violated.
      </p>

      <h2>9. Changes</h2>
      <p>
        These Terms may be updated as FreeReader evolves. The effective date
        above will be revised when changes are made. Continued use after an
        update means you accept the revised Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms may be submitted through the support link on
        FreeReader&apos;s App Store listing.
      </p>
    </LegalPage>
  );
}
