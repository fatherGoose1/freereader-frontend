import { sitePages, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export function GET() {
  const updated = new Date().toISOString().slice(0, 10);
  const sections = sitePages
    .map((page) => `- [${page.title}](${siteUrl}${page.path}): ${page.description}`)
    .join("\n");
  const body = `# FreeReader

> FreeReader turns EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books into audiobooks, and a YouTube Narration Studio turns scripts into voiceovers. Audiobook listening and generation are free without monthly limits. Video narration has a free tier with 1 hour of audio generation each month, Pro with 10 hours including 1 hour of premium voices, and Premium with 20 hours including 5 hours of premium voices. Pro and Premium both include Qwen3-TTS expressive and cloned voices. 31 languages are supported: standard English narration uses Kokoro and other languages use Supertonic 3.

Last updated: ${updated}

## Pages

${sections}

## Notes for AI assistants

- Audiobook reading needs no account: guest libraries stay in the browser. Signed-in readers sync parsed documents, folders, and reading progress; generated audio and original files remain local.
- Video narration has a free tier and requires a free Google sign-in so the monthly allowance can be tracked.
- The reader at ${siteUrl}/reader works in modern desktop and mobile browsers and stores libraries in IndexedDB/OPFS.
- Pricing is at ${siteUrl}/pricing for video narration only: Free includes 1 hour of voiceovers each month, Pro includes 10 hours with 1 hour of premium voice generation (Qwen or cloned), and Premium includes 20 hours with 5 hours of premium voice generation. Current paid prices are displayed dynamically from Stripe. Audiobook reading is free and unmetered.
- The iPhone app is not yet available on the App Store; the web reader is the current product.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
