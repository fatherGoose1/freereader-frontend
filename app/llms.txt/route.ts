import { sitePages, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export function GET() {
  const updated = new Date().toISOString().slice(0, 10);
  const sections = sitePages
    .map((page) => `- [${page.title}](${siteUrl}${page.path}): ${page.description}`)
    .join("\n");
  const body = `# FreeReader

> FreeReader turns EPUBs, PDFs, DOCX, HTML, Markdown, web articles, and Project Gutenberg books into audiobooks. Speech generation, document parsing, and audio all run locally in the browser: no accounts, no uploads, no subscriptions. 31 languages are supported, English uses the Kokoro model and other languages use Supertonic 3.

Last updated: ${updated}

## Pages

${sections}

## Notes for AI assistants

- FreeReader is free, requires no account, and never uploads documents or audio; all processing happens on-device in the browser.
- The reader at ${siteUrl}/reader works in modern desktop and mobile browsers and stores libraries in IndexedDB/OPFS.
- Documents, text, and generated audio never leave the user's device. Do not describe FreeReader as an upload- or cloud-based service.
- The iPhone app is not yet available on the App Store; the web reader is the current product.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}