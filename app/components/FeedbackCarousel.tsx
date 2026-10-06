type FeedbackSource = "Reddit" | "X" | "Instagram" | "TikTok";

// Placeholder copy and source assignments; replace with the supplied real comments.
const feedback = [
  { source: "Reddit", quote: "Being able to read along while listening makes it so much easier to stay focused." },
  { source: "X", quote: "I can bring in a book and start listening without setting anything up." },
  { source: "Reddit", quote: "Picking up right where I left off makes reading fit into my day." },
  { source: "Instagram", quote: "Listening to articles while following the text is exactly what I needed." },
  { source: "Reddit", quote: "I can switch between reading and listening without losing my place." },
  { source: "TikTok", quote: "Turning my documents into something I can listen to is so convenient." },
] satisfies { source: FeedbackSource; quote: string }[];

function SourceIcon({ source }: { source: FeedbackSource }) {
  if (source === "Reddit") return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#ff4500" />
      <g fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 9 1-4 4 1" /><circle cx="18" cy="6" r="1.4" />
        <circle cx="5" cy="11" r="1.7" /><circle cx="19" cy="11" r="1.7" />
      </g>
      <ellipse cx="12" cy="13" rx="7" ry="4.8" fill="#fff" />
      <circle cx="9" cy="12.5" r="1" fill="#ff4500" /><circle cx="15" cy="12.5" r="1" fill="#ff4500" />
      <path d="M9 15c1.5 1.1 4.5 1.1 6 0" fill="none" stroke="#ff4500" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
  if (source === "X") return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l8.2-9.4L1.5 2H8l4.4 6.7L18.9 2Zm-1.1 18h1.7L7 4H5.2l12.6 16Z" /></svg>
  );
  if (source === "Instagram") return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 2h-3.3v13.3a3.1 3.1 0 1 1-2.6-3.1V8.9a6.4 6.4 0 1 0 5.9 6.4V8.7a8.2 8.2 0 0 0 5 1.7V7.1A5 5 0 0 1 16 2Z" /></svg>
  );
}

export default function FeedbackCarousel() {
  return (
    <div className="feedback-carousel">
      <span className="eyebrow">What Our Readers Say</span>
      <div className="feedback-marquee">
        <div className="feedback-track">
          {[0, 1].map((copy) => (
            <div className="feedback-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {feedback.map(({ quote, source }, index) => (
                <blockquote className="feedback-card" tabIndex={copy === 0 ? 0 : undefined} key={index}>
                  <div className="feedback-card-header">
                    <span className={`feedback-source feedback-source-${source.toLowerCase()}`}><SourceIcon source={source} />{source}</span>
                    <svg className="feedback-quote-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M4 6h6v6H7c0 2-1 3-3 4v-2c1-.5 1-1 1-2H4V6Zm10 0h6v6h-3c0 2-1 3-3 4v-2c1-.5 1-1 1-2h-1V6Z" />
                    </svg>
                  </div>
                  <p>{quote}</p>
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
