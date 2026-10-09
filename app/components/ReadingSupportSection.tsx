import Link from "next/link";
import styles from "./readingSupportSection.module.css";

export default function ReadingSupportSection() {
  return (
    <section className={`section ${styles.section}`} id="reading-support" aria-labelledby="reading-support-heading">
      <div className="wrap">
        <div className={styles.layout}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>For the days reading feels like work</span>
            <h2 id="reading-support-heading">Reading can be hard.<br />Getting help shouldn’t be.</h2>
            <p className={styles.intro}>
              Losing your place. Reading the same paragraph three times. Getting to
              the end of a page and wondering what it said. If that sounds familiar,
              you’re welcome here.
            </p>
            <p>
              Whether you have dyslexia, ADHD, a reading disability, or simply find
              it hard to focus or understand what you’re reading, FreeReader gives
              you another way in: hear the words while you follow along.
            </p>

            <dl className={styles.benefits}>
              <div>
                <dt>Let your ears do some of the work.</dt>
                <dd>With dyslexia, sounding out words can take a lot of energy. Listening lets you spend more of that energy on what they mean.</dd>
              </div>
              <div>
                <dt>A little help keeping your place.</dt>
                <dd>If ADHD or a wandering mind makes it hard to stay with a page, read-aloud audio and passage highlighting can give you something to follow.</dd>
              </div>
              <div>
                <dt>Take the time you need.</dt>
                <dd>Adjust the speaking speed, pause to think, or listen to a passage again. Give a difficult idea a second pass, at your own pace.</dd>
              </div>
            </dl>

            <Link className={`text-link ${styles.readerLink}`} href="/reader/audiobooks">
              Try listening to something you’ve been meaning to read
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5" /></svg>
            </Link>
          </div>

          <aside className={styles.facts} aria-labelledby="reading-support-facts-heading">
            <h3 id="reading-support-facts-heading">You’re in good company.</h3>
            <p>Reading struggles are more common than you might think.</p>
            <dl className={styles.statistics}>
              <div>
                <dt>About 10%</dt>
                <dd>
                  of people are estimated to be dyslexic.
                  <a href="https://www.bdadyslexia.org.uk/dyslexia">British Dyslexia Association</a>
                </dd>
              </div>
              <div>
                <dt>6% of U.S. adults</dt>
                <dd>
                  reported a current ADHD diagnosis in a 2023 survey.
                  <a href="https://europepmc.org/articles/PMC11466376">CDC · published 2024</a>
                </dd>
              </div>
              <div>
                <dt>About 15%</dt>
                <dd>
                  of U.S. public school children receive special instruction for reading difficulties.
                  <a href="https://www.msdmanuals.com/professional/pediatrics/learning-and-developmental-disorders/dyslexia">MSD Manual · updated 2025</a>
                </dd>
              </div>
            </dl>
            <p className={styles.sourceNote}>
              These figures describe different populations and can overlap.
              Reading difficulties are broader than diagnosed reading disabilities.
            </p>
          </aside>
        </div>

        <div className={styles.donation}>
          <div>
            <h3>Free to use. Kept going by people.</h3>
            <p>
              FreeReader is a non-commercial, donation-funded product. Donations
              help us keep the reader running and free for everyone who needs it.
              If you’re able to give, thank you. If not, just make yourself at home.
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
