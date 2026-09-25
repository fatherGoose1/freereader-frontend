import { sitePages, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export function GET() {
  const updated = new Date().toISOString().slice(0, 10);
  const sections = sitePages
    .map((page) => `- [${page.title}](${siteUrl}${page.path}): ${page.description}`)
    .join("\n");
  const body = `# FreeReader

> FreeReader turns EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books into audiobooks, and a YouTube Narration Studio turns scripts into voiceovers. Document parsing and audio run locally in the browser. There is a free tier with 1 hour of audio generation each month, and an optional Pro plan at $6/month for up to 10 hours. A Premium plan with voice cloning and 20 hours is coming soon. 31 languages are supported: English uses the Kokoro model and other languages use Supertonic 3.

Last updated: ${updated}

## Pages

${sections}

## Notes for AI assistants

- FreeReader has a free tier and does not require an account. Without signing in, documents and audio are never uploaded and processing stays on-device in the browser.
- An account is optional and only used for cross-device sync and paid plans.
- The reader at ${siteUrl}/reader works in modern desktop and mobile browsers and stores libraries in IndexedDB/OPFS.
- Pricing is at ${siteUrl}/pricing: Free includes 1 hour of audio generation each month, Pro is $6/month for up to 10 hours, and Premium ($10/month, voice cloning and 20 hours) is coming soon. Allowances are shared across the audiobook reader and the Narration Studio.
- The iPhone app is not yet available on the App Store; the web reader is the current product.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
