import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Copyright & Rights Policy",
  description: "How to report copyright concerns about content processed through FreeReader and how we respond.",
  alternates: { canonical: "/copyright" },
};

export default function CopyrightPolicy() {
  return (
    <LegalPage
      title="Copyright & Rights Policy"
      updated="September 29, 2026"
      intro="FreeReader respects creators' rights. Here is how to report a concern about material available through our services."
    >
      <h2>Report a copyright concern</h2>
      <p>
        Email <a href="mailto:parker@birdseye.gg?subject=FreeReader%20Copyright%20Notice">parker@birdseye.gg</a>
        {" "}with enough information for us to locate and assess the material. Please include:
      </p>
      <ul>
        <li>the copyrighted work you believe has been infringed;</li>
        <li>the content at issue and where it can be found on or through FreeReader (such as a URL or other identifying details);</li>
        <li>your name and a way to contact you;</li>
        <li>a statement that you believe in good faith that the use is not authorized by the rights holder, their agent, or the law;</li>
        <li>a statement, under penalty of perjury, that the information in your notice is accurate and that you are authorized to act for the rights holder; and</li>
        <li>your physical or electronic signature.</li>
      </ul>
      <p>
        You do not need to send us the copyrighted book or other source file.
        FreeReader libraries are private and guest libraries are stored on
        users&apos; devices, so a title alone may not identify a particular
        account or material we control.
      </p>

      <h2>How we handle reports</h2>
      <p>
        We review reports and may request more information. When appropriate,
        we may disable access to synced material under our control, restrict
        features, or suspend or terminate an account. We cannot remove content
        stored solely on a user&apos;s device or remove material hosted by a
        third-party website. We consider repeat infringement when deciding
        whether to terminate an account; a complaint alone does not
        automatically establish infringement.
      </p>

      <h2>If your content is affected</h2>
      <p>
        If we contact you about a complaint and you believe your use is
        authorized or the material was identified in error, reply to our notice
        or email the address above. Identify the material and explain the basis
        for your claim, such as ownership, permission, a license, or public-domain
        status. We will review the information and respond as appropriate.
      </p>
      <p>
        See the <Link href="/terms">Terms of Use</Link> for the rights you must
        have before importing material or generating audio.
      </p>
    </LegalPage>
  );
}
