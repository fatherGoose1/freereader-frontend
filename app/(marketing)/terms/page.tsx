import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "VoiceReader Terms of Use and EULA",
  description:
    "Terms of Use and End User License Agreement for the VoiceReader iOS app and its web version, FreeReader.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <LegalPage
      title="VoiceReader Terms of Use and EULA"
      updated="September 5, 2026"
      intro="These terms govern your use of the VoiceReader iPhone app and the FreeReader website, including document imports and generated audio."
    >
      <aside className="legal-callout">
        <strong>Important notice about generated speech</strong>
        <p>
          VoiceReader and FreeReader use text-to-speech technology to generate
          spoken audio.
          Generated speech may mispronounce words, misinterpret abbreviations,
          skip or repeat content, or render formatting incorrectly. Do not rely
          on the App or Website for critical, medical, legal, or safety
          information.
        </p>
      </aside>

      <h2>1. Agreement to these terms</h2>
      <p>
        These Terms of Use and End User License Agreement (the &quot;Terms&quot;)
        are a binding agreement between you and Prism Labs LLC
        (&quot;Prism Labs,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;). They govern your use of the
        VoiceReader iOS application (the &quot;App&quot;) and related services.
        VoiceReader is also available on the web under the name FreeReader (the
        &quot;Website&quot;).
      </p>
      <p>
        By downloading, installing, accessing, or using the App or Website, you
        agree to these Terms. If you do not agree, do not use the App or Website.
        If you are under the age of legal majority where you live, your parent or
        legal guardian must review and agree to these Terms on your behalf.
      </p>

      <h2>2. What VoiceReader and FreeReader provide</h2>
      <p>
        VoiceReader and FreeReader are tools for turning supported documents into
        spoken audio. The App&apos;s document import, text extraction, speech
        generation, and playback features are designed to operate locally on a
        compatible iPhone. The web reader also supports optional account sync,
        server-generated speech, and a signed-in video narration studio. We do
        not guarantee any particular result, voice quality, or accuracy.
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
        VoiceReader and FreeReader use automated text-to-speech technology to
        generate spoken audio from your documents. Generated speech may contain
        pronunciation errors, awkward phrasing, incorrect pacing, omissions, or repetition,
        and may handle tables, footnotes, images, and unusual formatting poorly.
        The same text may produce different results across voices, languages,
        app versions, and iOS versions.
      </p>
      <p>
        You are responsible for evaluating generated audio and independently
        checking anything important. It is not medical, legal, financial, safety,
        or other professional advice, and it must not be used where an error
        could cause harm.
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
        <li>
          use the App or Website for unlawful, fraudulent, abusive, or harmful
          activity;
        </li>
        <li>attempt to bypass security, usage limits, or device permissions;</li>
        <li>
          reverse engineer, decompile, or extract models or source code except
          where law expressly permits it;
        </li>
        <li>
          copy, modify, distribute, rent, sell, sublicense, or commercially
          exploit the App or Website;
        </li>
        <li>
          use the App or Website to infringe intellectual property, privacy,
          publicity, or other rights; or
        </li>
        <li>
          misrepresent generated audio as professionally narrated, verified
          content, or as a statement from Prism Labs.
        </li>
      </ul>

      <h2>6. Your device, content, and local data</h2>
      <p>
        You are responsible for your device, its security, available storage,
        backups, and any content you choose to import or submit.
        VoiceReader data and anonymous FreeReader libraries are stored locally;
        however, web speech generation sends the passages being narrated to
        our speech service. If you sign in to the web audiobook reader, parsed
        books, folders, and reading progress sync to your account. Generated
        audio and original source files are not synced. Local data may be lost
        if storage is cleared.
      </p>
      <p>
        You retain any rights you have in content you import or submit. The
        limited license for content processed by our services is described in
        Section 7; content that remains solely on your device is not licensed
        to us.
      </p>

      <h2>7. Rights to source material and generated audio</h2>
      <p>
        Each time you import, paste, sync, or submit a book, article, document,
        script, or other material, you represent and warrant that you own or
        control the necessary rights, or have a lawful basis or all necessary
        permissions and licenses, to provide that material and authorize its
        use with the features you choose. This includes the right to have us
        receive and process text, store and sync parsed content if you sign in,
        and generate and play spoken audio. You also represent and warrant that
        your use of the material and any generated audio will comply with
        applicable law and will not infringe anyone else&apos;s rights or violate
        applicable third-party terms. You are responsible for the material you
        import or submit and for your use of generated audio.
      </p>
      <p>
        These rights may come from your own work, public-domain status in the
        relevant jurisdiction, permission, or an applicable license. If you
        share, publish, or sell generated audio, you must also have the rights
        needed for that use. Access to a book on Project Gutenberg, a public
        website, or another catalog, or purchase or borrowing of a copy, does
        not by itself establish its copyright status or grant narration,
        reproduction, synchronization, or distribution rights. Check the
        particular work, edition, location, and intended use. We do not verify
        or grant rights in third-party material by listing or linking it.
      </p>
      <p>
        For material you submit to our servers, you grant Prism Labs a
        non-exclusive, worldwide, royalty-free license, with the right to use
        service providers on our behalf, to receive, host, reproduce, convert,
        transmit, and process that material and generate audio solely to
        provide and maintain the features you request, including account sync
        and speech generation. This license lasts only as long as needed to
        provide those features or meet legal obligations and does not transfer
        ownership or authorize us to publish or sell your content. You
        represent and warrant that you have the rights needed to grant this
        license. See our <Link href="/privacy">Privacy Policy</Link> for how
        submitted material is handled.
      </p>

      <h2>8. Copyright complaints and repeat infringement</h2>
      <p>
        We review reports of alleged infringement sent through our{" "}
        <Link href="/copyright">Copyright &amp; Rights Policy</Link>. Where
        appropriate, we may remove or disable access to synced content under
        our control, restrict features, or suspend or terminate an account.
        We may terminate accounts of users who repeatedly infringe others&apos;
        rights in appropriate circumstances. We cannot remove content stored
        solely on a user&apos;s device. If you believe a report concerns material
        you are authorized to use, the policy explains how to respond.
      </p>

      <h2>9. Privacy</h2>
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> explains how the App and
        Website handle information and is incorporated into these Terms.
        The signed-in web audiobook reader syncs parsed documents and reading
        progress to your account. The App and Website also process limited
        diagnostics and analytics as described in
        that policy.
      </p>

      <h2>10. Website</h2>
      <p>
        The Website provides the web version of VoiceReader under the FreeReader
        name. We do not guarantee compatibility or availability in any country.
        We may suspend or discontinue the Website without liability.
      </p>

      <h2>11. Ownership and feedback</h2>
      <p>
        The App and Website, including their software, models, design, text,
        graphics, trademarks, and other materials, are owned by Prism Labs or
        its licensors and are protected by intellectual-property laws. If you
        send suggestions or feedback, you grant Prism Labs a perpetual,
        worldwide, royalty-free license to use it without restriction or
        compensation, but you are not required to provide feedback.
      </p>

      <h2>12. Updates, compatibility, and availability</h2>
      <p>
        VoiceReader may require a compatible device, operating-system version,
        and sufficient local resources. We may add, change, suspend, or remove
        features and may issue updates for security, compatibility, or product
        improvements. We do not promise that the App or Website will always be
        available, error-free, or compatible with every device or future iOS
        version.
      </p>

      <h2>13. Apple-specific terms</h2>
      <p>
        You and Prism Labs acknowledge that these Terms are between you and
        Prism Labs, not Apple Inc. (&quot;Apple&quot;), and Prism Labs, not
        Apple, is solely responsible for the App and its content.
      </p>
      <ul>
        <li>
          Apple has no obligation to provide maintenance or support for the App.
          Support is available through the link on VoiceReader&apos;s App Store
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

      <h2>14. Disclaimer of warranties</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, VOICEREADER, FREEREADER, AND ALL
        GENERATED AUDIO ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; PRISM
        LABS DISCLAIMS ALL EXPRESS, IMPLIED, AND STATUTORY WARRANTIES,
        INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY,
        QUIET ENJOYMENT, AND NON-INFRINGEMENT. PRISM LABS DOES NOT WARRANT THAT
        VOICEREADER, FREEREADER, OR THEIR OUTPUT WILL BE ACCURATE, COMPLETE, SAFE,
        AVAILABLE, OR FREE OF ERRORS OR HARMFUL COMPONENTS.
      </p>
      <p>
        Some jurisdictions do not allow certain warranty exclusions, so parts of
        this section may not apply to you. Nothing in these Terms limits rights
        that cannot lawfully be waived.
      </p>

      <h2>15. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRISM LABS AND ITS MEMBERS,
        MANAGERS, EMPLOYEES, CONTRACTORS, LICENSORS, AND AFFILIATES WILL NOT BE
        LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
        PUNITIVE DAMAGES, OR FOR LOST DATA, PROFITS, REVENUE, GOODWILL, OR
        OPPORTUNITIES, ARISING OUT OF OR RELATED TO VOICEREADER, FREEREADER, OR
        GENERATED AUDIO.
      </p>
      <p>
        To the maximum extent permitted by law, the total liability of Prism
        Labs for all claims arising out of or relating to the App or Website will
        not exceed the greater of 50 U.S. dollars or the amount you paid us for
        the App or Website in the 12 months before the claim.
        These limitations apply regardless of the legal theory and even if a
        remedy fails of its essential purpose.
      </p>

      <h2>16. Indemnification</h2>
      <p>
        To the extent permitted by law, you agree to defend, indemnify, and hold
        harmless Prism Labs and its affiliates from claims, losses, and
        expenses, including reasonable legal fees, arising from your unlawful
        use of the App or Website, your violation of these Terms, or your
        infringement of another person&apos;s rights. This obligation does not apply
        to the extent a claim results from Prism Labs&apos; own unlawful conduct.
      </p>

      <h2>17. Termination</h2>
      <p>
        These Terms remain effective until terminated. You may terminate them by
        stopping use of and deleting the App. Your license terminates
        automatically if you materially violate these Terms. We may restrict,
        suspend, or terminate access to the Website for violations of these
        Terms, including repeated infringement, where appropriate. Provisions
        that by their nature should survive termination will survive, including
        ownership, disclaimers, liability limits, and dispute provisions.
      </p>

      <h2>18. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the State of New Jersey, United
        States, without regard to conflict-of-law principles. Subject to any
        mandatory consumer rights that apply where you live, courts located in
        New Jersey will have exclusive jurisdiction over disputes arising from
        these Terms, the App, or the Website. The United Nations Convention on
        Contracts for the International Sale of Goods does not apply.
      </p>

      <h2>19. General terms</h2>
      <p>
        These Terms and the Privacy Policy are the entire agreement between you
        and Prism Labs regarding the App and Website. If any provision is
        unenforceable, it will be modified only as much as necessary, and the
        remaining provisions will remain effective. Our failure to enforce a
        provision is not a waiver. You may not assign these Terms without our
        consent; Prism Labs may assign them as part of a merger, reorganization,
        financing, or sale of assets.
      </p>

      <h2>20. Changes to these terms</h2>
      <p>
        We may update these Terms as the App, Website, or applicable law changes.
        We will post the revised Terms and update the effective date. If a
        material change requires additional notice or consent, we will provide
        it as required by law. Continued use after an update takes effect
        constitutes acceptance of the updated Terms.
      </p>

      <h2>21. Contact</h2>
      <p>
        Prism Labs LLC
        <br />
        New Jersey, United States
      </p>
      <p>
        Product support, rights reports, privacy requests, and legal questions
        can be sent through our <Link href="/support">support page</Link>.
      </p>
    </LegalPage>
  );
}
