export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io").replace(/\/+$/, "");

export const sitePages = [
  { path: "/", title: "FreeReader — Listen to books, documents, and articles", description: "Text to speech on the web, iPhone, and Chrome. Listen for one hour free each day or upgrade to FreeReader Gold for unlimited listening.", priority: 1, changeFrequency: "weekly" as const },
  { path: "/reader", title: "FreeReader Web Workspaces", description: "Choose the audiobook reader for books and documents or the Narration Studio for video scripts.", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/reader/audiobooks", title: "FreeReader Audiobook Reader", description: "Import EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books. Listen for one hour free each day, with unlimited audio on Gold.", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/authors/submissions", title: "Submit a book to FreeReader", description: "Submit your book and share a browser-based read-aloud link with your readers.", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/school", title: "FreeReader EDU for Schools", description: "Reading and listening tools for students with dyslexia, ADHD, and other reading challenges. School plans cost $3 per student per year.", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/pricing", title: "FreeReader Pricing", description: "One hour of free audiobook listening per day. Gold offers unlimited listening for $39/year or $5/month. Video narration plans are listed separately.", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/narration", title: "FreeReader YouTube Narration Studio", description: "Create video voiceovers from scripts with a free monthly allowance or paid Pro and Premium plans.", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/blog", title: "The FreeReader Blog", description: "Reading tips, accessibility guides, and product updates from FreeReader.", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/support", title: "Support", description: "Get help with FreeReader: importing books, playback, voices, and privacy questions.", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/copyright", title: "Copyright & Rights Policy", description: "How to report copyright concerns about content available through FreeReader.", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", title: "Privacy Policy", description: "How FreeReader handles local libraries, account sync, speech requests, and analytics.", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/terms", title: "Terms of Service", description: "The terms that apply when you use FreeReader.", priority: 0.3, changeFrequency: "yearly" as const },
];
