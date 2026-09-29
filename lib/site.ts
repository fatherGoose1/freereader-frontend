export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io").replace(/\/+$/, "");

export const sitePages = [
  { path: "/", title: "FreeReader — Your books, out loud", description: "Listen to books and documents you have the rights to narrate, with natural voices and optional account sync.", priority: 1, changeFrequency: "weekly" as const },
  { path: "/reader", title: "FreeReader Web Reader", description: "Import EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books, then listen to them in your browser.", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/pricing", title: "Video narration pricing", description: "Create video voiceovers with 1 free hour a month, 10 hours on Pro, or 20 hours on Premium with voice cloning. Audiobook reading is always free.", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/support", title: "Support", description: "Get help with FreeReader: importing books, playback, voices, and privacy questions.", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/copyright", title: "Copyright & Rights Policy", description: "How to report copyright concerns about content available through FreeReader.", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", title: "Privacy Policy", description: "How FreeReader handles local libraries, account sync, speech requests, and analytics.", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/terms", title: "Terms of Service", description: "The terms that apply when you use FreeReader.", priority: 0.3, changeFrequency: "yearly" as const },
];
