import type { Metadata } from "next";
import SchoolContactForm from "./SchoolContactForm";
import styles from "./school.module.css";

export const metadata: Metadata = {
  title: "FreeReader for Schools",
  description: "Reading accessibility for students with dyslexia, ADHD, and other challenges. Bring FreeReader to your school for $3 per student per year.",
  alternates: { canonical: "/school" },
};

const benefits = [
  { title: "$3 per student per year", detail: "We charge to cover costs, no more." },
  { title: "No license management needed", detail: "Unlimited teachers, no license management needed." },
  { title: "Support along the way", detail: "We'll help you get set up and support you along the way." },
];

export default function SchoolPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="school-heading">
        <div className={`wrap ${styles.inner}`}>
          <div className={styles.copy}>
            <h1 id="school-heading">Reading accessibility for students with dyslexia, ADHD, and other challenges.</h1>
            <p className={styles.lede}>Talking about turning PDFs, textbooks, web pages, and anything into audio.</p>
            <ul className={styles.benefits} aria-label="School benefits">
              {benefits.map(({ title, detail }) => (
                <li key={title}>
                  <span className={styles.check} aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.2 3.2 7.8-8" /></svg>
                  </span>
                  <span><strong>{title}</strong><span>{detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <aside className={styles.contact} aria-labelledby="school-contact-heading">
            <h2 id="school-contact-heading">Bring FreeReader to your school.</h2>
            <p>Tell us a little about your school or district and we&apos;ll help you get started.</p>
            <SchoolContactForm />
            <p className={styles.direct}>Prefer to communicate via email? <a href="mailto:parker@birdseye.gg?subject=FreeReader%20for%20Schools">Email our team</a></p>
          </aside>
        </div>
      </section>
    </main>
  );
}
