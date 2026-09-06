import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { DOMParser as LinkeDOMParser } from "linkedom";

const JANE_EYRE = "119-2014-04-09-Jane Eyre.pdf";
const LION_WITCH_WARDROBE = "lewis-lion-the-witch-and-the-wardrobe.epub";
const REDDIT_URL = "https://www.reddit.com/r/iOSAppsMarketing/comments/1w821t5/how_important_is_the_marketcountry_mix_for/";
const REDDIT_EMBED_URL = "https://embed.reddit.com/r/iOSAppsMarketing/comments/1w821t5/how_important_is_the_marketcountry_mix_for/";
const RAW_GITHUB_URL = "https://raw.githubusercontent.com/ethereumbook/ethereumbook/refs/heads/develop/src/chapter_17.md";
const GITHUB_URL = "https://github.com/ethereumbook/ethereumbook/blob/develop/src/chapter_17.md";
const RESOLVED_GITHUB_URL = "https://raw.githubusercontent.com/ethereumbook/ethereumbook/develop/src/chapter_17.md";

let parseFile: typeof import("./importers").parseFile;
let parseWebLink: typeof import("./importers").parseWebLink;

before(async () => {
  ({ parseFile, parseWebLink } = await import("./importers"));
});

async function fixtureFile(name: string): Promise<File> {
  const data = await readFile(new URL(`../../${name}`, import.meta.url));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return {
    name,
    size: data.byteLength,
    arrayBuffer: async () => buffer,
    text: async () => data.toString("utf8"),
  } as File;
}

function installDom(includeWindow = false): () => void {
  const domParserDescriptor = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  class TestDOMParser {
    parseFromString(markup: string, mimeType: string) {
      const document = new LinkeDOMParser().parseFromString(markup, mimeType as "text/html");
      const querySelector = document.querySelector.bind(document);
      Object.defineProperty(document, "querySelector", {
        configurable: true,
        value: (selector: string) => {
          try {
            return querySelector(selector);
          } catch (error) {
            // EPUB.js falls back to getAttributeNS when this selector is unsupported.
            if (selector.includes("[*|type=")) return null;
            throw error;
          }
        },
      });
      return document;
    }
  }
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: TestDOMParser });
  if (includeWindow) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { decodeURIComponent, URL },
    });
  }
  return () => {
    if (domParserDescriptor) Object.defineProperty(globalThis, "DOMParser", domParserDescriptor);
    else Reflect.deleteProperty(globalThis, "DOMParser");
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

function mockSuccessfulFetch(contentType: string, body: string, calls: string[]): () => void {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push(url);
      return {
        ok: true,
        headers: new Headers({ "content-type": contentType }),
        text: async () => body,
        url,
      } as Response;
    },
  });
  return () => {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    else Reflect.deleteProperty(globalThis, "fetch");
  };
}

test("imports the Jane Eyre PDF without native Promise.withResolvers", { timeout: 30_000 }, async () => {
  const withResolversDescriptor = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
  Reflect.deleteProperty(Promise, "withResolvers");
  try {
    const parsed = await parseFile(await fixtureFile(JANE_EYRE));
    assert.equal(parsed.format, "pdf");
    assert.ok(parsed.blocks.length > 1_000);
    assert.ok(parsed.blocks.some((block) => block.text.toLowerCase().includes("jane eyre")));
    assert.ok(new Set(parsed.blocks.map((block) => block.page).filter(Boolean)).size > 600);
  } finally {
    if (withResolversDescriptor) Object.defineProperty(Promise, "withResolvers", withResolversDescriptor);
    else Reflect.deleteProperty(Promise, "withResolvers");
  }
});

test("imports The Lion, the Witch and the Wardrobe EPUB", { timeout: 30_000 }, async () => {
  const restoreDom = installDom(true);
  try {
    const parsed = await parseFile(await fixtureFile(LION_WITCH_WARDROBE));
    assert.equal(parsed.format, "epub");
    assert.ok(parsed.chapters.length > 20);
    assert.ok(parsed.blocks.length > 1_000);
    assert.ok(parsed.blocks.some((block) => block.text === "The Lion, the Witch and the Wardrobe"));
    assert.ok(parsed.blocks.some((block) => block.text === "Chapter I"));
  } finally {
    restoreDom();
  }
});

test("imports the Reddit post through its embed page", async () => {
  const html = `<!doctype html><html><head><title>Reddit</title></head><body><main><article>
    <h1>How important is the market/country mix for monetization? 1.3K downloads, 16.2% conversion, but only $117 proceeds</h1>
    <p>I am evaluating how the mix of customers across countries affects an iOS app launch. This paragraph contains enough meaningful detail for the reader extraction pipeline to retain the post content rather than treating it as navigation.</p>
    <p>The practical question is whether developers should optimize for one primary market first or account for several countries when planning pricing, localization, and promotion strategy.</p>
  </article></main></body></html>`;
  const calls: string[] = [];
  const restoreDom = installDom();
  const restoreFetch = mockSuccessfulFetch("text/html", html, calls);
  try {
    const result = await parseWebLink(REDDIT_URL);
    assert.deepEqual(calls, [REDDIT_EMBED_URL]);
    assert.equal(result.sourceUrl, REDDIT_EMBED_URL);
    assert.equal(result.parsed.title, "How important is the market/country mix for monetization? 1.3K downloads, 16.2% conversion, but only $117 proceeds");
    assert.ok(result.parsed.blocks.some((block) => block.text.includes("customers across countries")));
  } finally {
    restoreFetch();
    restoreDom();
  }
});

const chapterMarkdown = `# Chapter 17. Zero-Knowledge Proofs

In this chapter, we'll explore the fascinating world of zero-knowledge cryptography and see how it applies to the Ethereum roadmap.

## History

Zero-knowledge proofs were introduced as a way to prove that a statement is true without revealing any information beyond its validity.
`;

test("imports the raw GitHub Markdown URL", async () => {
  const calls: string[] = [];
  const restoreDom = installDom();
  const restoreFetch = mockSuccessfulFetch("text/plain; charset=utf-8", chapterMarkdown, calls);
  try {
    const result = await parseWebLink(RAW_GITHUB_URL);
    assert.deepEqual(calls, [RAW_GITHUB_URL]);
    assert.equal(result.sourceUrl, RAW_GITHUB_URL);
    assert.equal(result.parsed.title, "Chapter 17. Zero-Knowledge Proofs");
    assert.ok(result.parsed.blocks.some((block) => block.text.includes("Ethereum roadmap")));
  } finally {
    restoreFetch();
    restoreDom();
  }
});

test("resolves a GitHub blob URL directly to raw.githubusercontent.com", async () => {
  const calls: string[] = [];
  const restoreDom = installDom();
  const restoreFetch = mockSuccessfulFetch("text/plain; charset=utf-8", chapterMarkdown, calls);
  try {
    const result = await parseWebLink(GITHUB_URL);
    assert.deepEqual(calls, [RESOLVED_GITHUB_URL]);
    assert.equal(result.sourceUrl, RESOLVED_GITHUB_URL);
    assert.equal(result.parsed.title, "Chapter 17. Zero-Knowledge Proofs");
    assert.ok(result.parsed.blocks.some((block) => block.text.includes("Ethereum roadmap")));
  } finally {
    restoreFetch();
    restoreDom();
  }
});
