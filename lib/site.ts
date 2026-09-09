export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.freereader.io").replace(/\/+$/, "");

export const sitePages = [
  { path: "/", title: "FreeReader — Your books, out loud", description: "Turn anything into an audiobook. Listen to your EPUBs, PDFs, and text files with natural voices, free and private.", priority: 1, changeFrequency: "weekly" as const },
  { path: "/reader", title: "FreeReader Web Reader", description: "Import EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books, then listen to them in your browser.", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/support", title: "Support", description: "Get help with FreeReader: importing books, playback, voices, and privacy questions.", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/privacy", title: "Privacy Policy", description: "How FreeReader handles your data: everything stays on your device.", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/terms", title: "Terms of Service", description: "The terms that apply when you use FreeReader.", priority: 0.3, changeFrequency: "yearly" as const },
];