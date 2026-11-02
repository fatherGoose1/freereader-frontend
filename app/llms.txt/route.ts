import { sitePages, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export function GET() {
  const pages = sitePages
    .map((page) => `- [${page.title}](${siteUrl}${page.path}): ${page.description}`)
    .join("\n");
  const body = `# FreeReader

> FreeReader is a text-to-speech reader for books, documents, and articles on the web and iPhone, with a Chrome extension for web pages and Reddit threads. The free plan includes one hour of listening per day. FreeReader Gold costs $39 per year or $5 per month and offers unlimited audiobook audio. FreeReader EDU offers reading support for schools.

## Official pages

${pages}

## Apps

- [FreeReader for iPhone](https://apps.apple.com/app/voicereader-text-to-speech/id6808351587): iOS reading and listening app.
- [FreeReader Chrome extension](https://chromewebstore.google.com/detail/freereader-text-to-speech/nkndgadokffoldebphmdphjepcedcakc): Listen to web pages and Reddit threads, with a different voice for each user in a Reddit thread.

## Questions and answers

### Is FreeReader free?
Yes, the audiobook reader includes up to one hour of free listening per day. FreeReader Gold offers unlimited audiobook audio for $39/year or $5/month. Video narration has separate monthly allowances and plans; see ${siteUrl}/pricing.

### Where can I use FreeReader?
Use the [web audiobook reader](${siteUrl}/reader/audiobooks), the iPhone app, or the Chrome extension. The extension can read Reddit threads aloud using a distinct voice for each user.

### What can the web audiobook reader open?
EPUB, PDF, DOCX, HTML, Markdown, web articles, and Project Gutenberg books. The web reader stores free libraries locally; Gold subscribers can sync parsed documents, folders, and reading progress across devices. Original files and generated audio remain local. Generating new audio in the web reader requires a free account.

### What does FreeReader offer schools?
[FreeReader for Schools](${siteUrl}/school) offers reading and listening tools for students who find reading difficult, including students with dyslexia or ADHD. FreeReader EDU supports school-managed assignments and read-along highlighting. School plans cost $3 per student per year; schools can contact the team on the schools page.

### Does FreeReader have a blog?
Yes. Read [the FreeReader Blog](${siteUrl}/blog) for articles and product updates. Published articles are also listed in [the sitemap](${siteUrl}/sitemap.xml).
`;
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
