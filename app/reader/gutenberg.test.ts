import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser as LinkeDOMParser } from "linkedom";
import { browseGutenberg } from "./gutenberg";

function installDom(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  class TestDOMParser {
    parseFromString(markup: string, mimeType: string) {
      return new LinkeDOMParser().parseFromString(markup, mimeType as "text/xml");
    }
  }
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: TestDOMParser });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "DOMParser", descriptor);
    else Reflect.deleteProperty(globalThis, "DOMParser");
  };
}

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Pride and Prejudice</title>
    <content type="text">Jane Austen</content>
    <link type="application/atom+xml;profile=opds-catalog" rel="subsection" href="/ebooks/1342.opds"/>
    <link type="image/png" rel="http://opds-spec.org/image/thumbnail" href="data:image/png;base64,iVBORw0KGgo="/>
  </entry>
  <entry>
    <title>Missing link</title>
    <content type="text">Nobody</content>
  </entry>
</feed>`;

test("covers use the same-origin proxy instead of CORS-blocked Gutenberg images", async (t) => {
  const restoreDom = installDom();
  const originalFetch = globalThis.fetch;
  // A real Response has an empty .url in Node; gutenberg.ts resolves relative
  // OPDS links against the feed URL, so provide it explicitly.
  globalThis.fetch = async () => ({
    ok: true,
    url: "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads",
    text: async () => FEED,
  }) as Response;
  t.after(() => {
    restoreDom();
    globalThis.fetch = originalFetch;
  });

  const books = await browseGutenberg();
  assert.equal(books.length, 1);
  assert.deepEqual(books[0], {
    id: "1342",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    detailUrl: "https://www.gutenberg.org/ebooks/1342.opds",
    // Relative, so the browser requests it from the FreeReader origin under COEP.
    coverUrl: "/api/gutenberg/cover/1342",
  });
});
