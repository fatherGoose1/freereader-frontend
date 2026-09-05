import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use and EULA",
  description:
    "Terms of Use and End User License Agreement for the FreeReader iOS app and website.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use and EULA"
      updated="September 3, 2026"
      intro="These terms govern your use of the FreeReader iPhone app, its locally generated audio, and the FreeReader website."
    >
      <aside className="legal-callout">
        <strong>Important notice about generated speech</strong>
        <p>
          FreeReader uses text-to-speech technology to generate spoken audio.
          Generated speech may mispronounce words, misinterpret abbreviations,
          skip or repeat content, or render formatting incorrectly. Do not rely
          on FreeReader for critical, medical, legal, or safety information.
        </p>
      </aside>

      <h2>1. Agreement to these terms</h2>
      <p>
        These Terms of Use and End User License Agreement (the &quot;Terms&quot;)
        are a binding agreement between you and Prism Labs LLC
        (&quot;Prism Labs,&rdquo; &ldquo;FreeReader,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;). They govern your use of the
        FreeReader iOS application (the &quot;App&quot;), the FreeReader
        website (the &quot;Website&quot;), and related services.
      </p>
      <p>
        By downloading, installing, accessing, or using FreeReader, you agree to
        these Terms. If you do not agree, do not use FreeReader. If you are
        under the age of legal majority where you live, your parent or legal
        guardian must review and agree to these Terms on your behalf.
      </p>

      <h2>2. What FreeReader provides</h2>
      <p>
        FreeReader is a tool for turning supported documents into spoken audio.
        Its document import, text extraction, speech generation, and playback
        features are designed to operate locally on a compatible iPhone.
        FreeReader is provided free of charge, does not require an account, and
        is not a professional narration, translation, or accessibility service.
        We do not guarantee any particular result, voice quality, or accuracy.
      </p>

      <h2>3. License to use the App</h2>
      <p>
        Subject to these Terms and the Apple Media Services Terms and
        Conditions, Prism Labs grants you a limited, personal, revocable,
        non-exclusive, non-transferable license to install and use the App on
        Apple-branded devices that you own or control, as permitted by
        Apple&apos;s Usage Rules. The App may also be accessed by other accounts
        associated with you through Family Sharing or volume purchasing where
        Apple permits it.
      </p>
      <p>
        The App is licensed, not sold. Prism Labs and its licensors retain all
        rights not expressly granted in these Terms.
      </p>

      <h2>4. Generated speech</h2>
      <p>
        FreeReader uses automated text-to-speech technology to generate spoken
        audio from your documents. Generated speech may contain pronunciation
        errors, awkward phrasing, incorrect pacing, omissions, or repetition,
        and may handle tables, footnotes, images, and unusual formatting poorly.
        The same text may produce different results across voices, languages,
        app versions, and iOS versions.
      </p>
      <p>
        You are responsible for evaluating generated audio and independently
        checking anything important. Generated audio is provided for personal
        listening only. It is not medical, legal, financial, safety, or other
        professional advice, and it must not be used where an error could cause
        harm.
      </p>
      <p>
        To the fullest extent permitted by law, you assume the risks of using or
        relying on generated audio. Prism Labs is not responsible or liable for
        decisions, actions, losses, injury, offense, misunderstandings, or other
        consequences arising from generated audio or your reliance on it.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use FreeReader for unlawful, fraudulent, abusive, or harmful activity;</li>
        <li>attempt to bypass security, usage limits, or device permissions;</li>
        <li>
          reverse engineer, decompile, or extract models or source code except
          where law expressly permits it;
        </li>
        <li>
          copy, modify, distribute, rent, sell, sublicense, or commercially
          exploit FreeReader;
        </li>
        <li>
          use FreeReader to infringe intellectual property, privacy, publicity,
          or other rights; or
        </li>
        <li>
          misrepresent generated audio as professionally narrated, verified
          content, or as a statement from Prism Labs.
        </li>
      </ul>

      <h2>6. Your device, content, and local data</h2>
      <p>
        You are responsible for your device, its security, available storage,
        backups, and any content you choose to import. You represent that you
        have the right to use the documents you import with FreeReader. Because
        App data is designed to remain local, Prism Labs cannot access, recover,
        restore, moderate, or back up your documents, generated audio, or
        listening progress. Data may be lost if the App or device is deleted,
        damaged, reset, or replaced.
      </p>
      <p>
        You retain any rights you have in content you import. You grant Prism
        Labs no license to App content that never leaves your device.
      </p>

      <h2>7. Privacy</h2>
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> explains how the App and
        Website handle information and is incorporated into these Terms. The App
        does not send us your documents, their text, or generated audio. The App
        and the Website separately process limited diagnostics and analytics as
        described in that policy.
      </p>

      <h2>8. Website</h2>
      <p>
        The Website is provided for general information about FreeReader and
        does not guarantee compatibility or availability in any country. We may
        suspend or discontinue the Website without liability.
      </p>

      <h2>9. Ownership and feedback</h2>
      <p>
        FreeReader, including its software, models, design, text, graphics,
        trademarks, and other materials, is owned by Prism Labs or its licensors
        and is protected by intellectual-property laws. If you send suggestions
        or feedback, you grant Prism Labs a perpetual, worldwide, royalty-free
        license to use it without restriction or compensation, but you are not
        required to provide feedback.
      </p>

      <h2>10. Updates, compatibility, and availability</h2>
      <p>
        FreeReader may require a compatible device, operating-system version,
        and sufficient local resources. We may add, change, suspend, or remove
        features and may issue updates for security, compatibility, or product
        improvements. We do not promise that FreeReader will always be
        available, error-free, or compatible with every device or future iOS
        version.
      </p>

      <h2>11. Apple-specific terms</h2>
      <p>
        You and Prism Labs acknowledge that these Terms are between you and
        Prism Labs, not Apple Inc. (&quot;Apple&quot;), and Prism Labs, not
        Apple, is solely responsible for the App and its content.
      </p>
      <ul>
        <li>
          Apple has no obligation to provide maintenance or support for the App.
          Support is available through the link on FreeReader&apos;s App Store
          listing.
        </li>
        <li>
          If the App fails to conform to an applicable warranty, you may notify
          Apple, and Apple may refund the purchase price, if any. To the maximum
          extent permitted by law, Apple has no other warranty obligation for
          the App.
        </li>
        <li>
          Prism Labs, not Apple, is responsible for addressing claims relating
          to the App, including product-liability claims, claims that the App
          fails to conform to legal or regulatory requirements, and claims under
          consumer-protection, privacy, or similar laws.
        </li>
        <li>
          If a third party claims that the App or your possession and use of it
          infringes intellectual property rights, Prism Labs, not Apple, is
          responsible for investigating, defending, settling, and discharging
          that claim as required by these Terms and applicable law.
        </li>
        <li>
          You represent that you are not located in a country subject to a U.S.
          government embargo or designated as a terrorist-supporting country,
          and that you are not listed on a U.S. government prohibited or
          restricted-party list.
        </li>
        <li>
          You must comply with applicable third-party terms when using the App,
          including your wireless-data and Apple Media Services agreements.
        </li>
      </ul>
      <p>
        Apple and its subsidiaries are third-party beneficiaries of these Terms.
        Once you accept these Terms, Apple has the right to enforce the
        Apple-specific provisions against you as a third-party beneficiary.
      </p>

      <h2>12. Disclaimer of warranties</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, FREEREADER AND ALL GENERATED
        AUDIO ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; PRISM
        LABS DISCLAIMS ALL EXPRESS, IMPLIED, AND STATUTORY WARRANTIES,
        INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY,
        QUIET ENJOYMENT, AND NON-INFRINGEMENT. PRISM LABS DOES NOT WARRANT THAT
        FREEREADER OR ITS OUTPUT WILL BE ACCURATE, COMPLETE, SAFE, AVAILABLE, OR
        FREE OF ERRORS OR HARMFUL COMPONENTS.
      </p>
      <p>
        Some jurisdictions do not allow certain warranty exclusions, so parts of
        this section may not apply to you. Nothing in these Terms limits rights
        that cannot lawfully be waived.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRISM LABS AND ITS MEMBERS,
        MANAGERS, EMPLOYEES, CONTRACTORS, LICENSORS, AND AFFILIATES WILL NOT BE
        LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
        PUNITIVE DAMAGES, OR FOR LOST DATA, PROFITS, REVENUE, GOODWILL, OR
        OPPORTUNITIES, ARISING OUT OF OR RELATED TO FREEREADER OR GENERATED
        AUDIO.
      </p>
      <p>
        To the maximum extent permitted by law, the total liability of Prism
        Labs for all claims arising out of or relating to FreeReader will not
        exceed 50 U.S. dollars, because FreeReader is provided free of charge.
        These limitations apply regardless of the legal theory and even if a
        remedy fails of its essential purpose.
      </p>

      <h2>14. Indemnification</h2>
      <p>
        To the extent permitted by law, you agree to defend, indemnify, and hold
        harmless Prism Labs and its affiliates from claims, losses, and
        expenses, including reasonable legal fees, arising from your unlawful
        use of FreeReader, your violation of these Terms, or your infringement
        of another person&apos;s rights. This obligation does not apply to the
        extent a claim results from Prism Labs&apos; own unlawful conduct.
      </p>

      <h2>15. Termination</h2>
      <p>
        These Terms remain effective until terminated. You may terminate them by
        stopping use of and deleting the App. Your license terminates
        automatically if you materially violate these Terms. Provisions that by
        their nature should survive termination will survive, including
        ownership, disclaimers, liability limits, and dispute provisions.
      </p>

      <h2>16. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the State of New Jersey, United
        States, without regard to conflict-of-law principles. Subject to any
        mandatory consumer rights that apply where you live, courts located in
        New Jersey will have exclusive jurisdiction over disputes arising from
        these Terms or FreeReader. The United Nations Convention on Contracts
        for the International Sale of Goods does not apply.
      </p>

      <h2>17. General terms</h2>
      <p>
        These Terms and the Privacy Policy are the entire agreement between you
        and Prism Labs regarding FreeReader. If any provision is unenforceable,
        it will be modified only as much as necessary, and the remaining
        provisions will remain effective. Our failure to enforce a provision is
        not a waiver. You may not assign these Terms without our consent; Prism
        Labs may assign them as part of a merger, reorganization, financing, or
        sale of assets.
      </p>

      <h2>18. Changes to these terms</h2>
      <p>
        We may update these Terms as FreeReader or applicable law changes. We
        will post the revised Terms and update the effective date. If a material
        change requires additional notice or consent, we will provide it as
        required by law. Continued use after an update takes effect constitutes
        acceptance of the updated Terms.
      </p>

      <h2>19. Contact</h2>
      <p>
        Prism Labs LLC
        <br />
        New Jersey, United States
      </p>
      <p>
        Product support is available through the link on FreeReader&apos;s App
        Store listing. Privacy requests and legal questions can also be
        submitted through that link.
      </p>
    </LegalPage>
  );
}
