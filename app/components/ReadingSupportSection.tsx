import Link from "next/link";
import styles from "./readingSupportSection.module.css";

export default function ReadingSupportSection() {
  return (
    <section className={`section ${styles.section}`} id="reading-support" aria-labelledby="reading-support-heading">
      <div className="wrap">
        <div className={styles.layout}>
          <div className={styles.copy}>
            <h2 id="reading-support-heading">For people with dyslexia, ADHD, and reading disabilities.</h2>
            <p>
              With dyslexia, reading each word can take so much effort that it’s
              hard to keep track of what a sentence means. FreeReader reads your
              books and documents aloud, so you can listen instead or follow the
              text as you hear it.
            </p>
            <p>
              ADHD and trouble focusing can mean losing your place or reading the
              same paragraph over and over. Audio and passage highlighting can
              help you stay with the text and find your place when your attention
              drifts.
            </p>
            <p>
              If you get to the end of a page without understanding what you’ve
              read, hearing it may help. You can slow the voice down, pause to
              think, and listen again as often as you need.
            </p>

            <Link className={`text-link ${styles.readerLink}`} href="/reader/audiobooks">
              Open the free reader
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5" /></svg>
            </Link>
          </div>

          <aside className={styles.facts} aria-label="Reading difficulties in numbers">
            <dl className={styles.statistics}>
              <div>
                <dt>10% <span>≈ 800 million people</span></dt>
                <dd>
                  Estimated to have dyslexia worldwide, applying the 10% estimate to a population of 8 billion.
                  <a href="https://www.bdadyslexia.org.uk/dyslexia">British Dyslexia Association</a>
                  <a href="https://www.un.org/en/global-issues/population">UN · world population reached 8 billion in 2022</a>
                </dd>
              </div>
              <div>
                <dt>6% <span>15.5 million adults</span></dt>
                <dd>
                  U.S. adults who reported a current ADHD diagnosis in a 2023 survey.
                  <a href="https://europepmc.org/articles/PMC11466376">CDC · published 2024</a>
                </dd>
              </div>
              <div>
                <dt>15% <span>≈ 7.4 million children</span></dt>
                <dd>
                  U.S. public school children receiving special instruction for reading difficulties, estimated using 2022 enrollment.
                  <a href="https://www.msdmanuals.com/professional/pediatrics/learning-and-developmental-disorders/dyslexia">MSD Manual · updated 2025</a>
                  <a href="https://nces.ed.gov/programs/coe/indicator/cga/public-school-enrollment">NCES · 49.6 million students in 2022</a>
                </dd>
              </div>
            </dl>
            <p className={styles.sourceNote}>
              Dyslexia and reading-support headcounts are rough calculations,
              not measured totals. These groups can overlap.
              Reading difficulties are broader than diagnosed reading disabilities.
            </p>
          </aside>
        </div>

        <div className={styles.donation}>
          <div>
            <p>
              FreeReader is a non-commercial, donation-funded product. Donations
              help us keep the reader running and free for everyone who needs it.
              You don’t need to donate to use it.
            </p>
          </div>
          <a className="coffee-button" href="https://buymeacoffee.com/freereader" target="_blank" rel="noopener noreferrer">
            Help keep FreeReader free
          </a>
        </div>
      </div>
    </section>
  );
}
