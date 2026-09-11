import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test, { before, after, mock } from "node:test";
import { Worker } from "node:worker_threads";
import { DOMParser as LinkeDOMParser } from "linkedom";
import JSZip from "jszip";
import mammoth from "mammoth";
import { ImportError, importFailureProperties } from "./importErrors";
import { fileTypeHint, MAX_IMPORT_BYTES } from "./importFormats";

const JANE_EYRE = "119-2014-04-09-Jane Eyre.pdf";
const LION_WITCH_WARDROBE = "lewis-lion-the-witch-and-the-wardrobe.epub";
const REDDIT_URL = "https://www.reddit.com/r/iOSAppsMarketing/comments/1w821t5/how_important_is_the_marketcountry_mix_for/";
const REDDIT_EMBED_URL = "https://embed.reddit.com/r/iOSAppsMarketing/comments/1w821t5/how_important_is_the_marketcountry_mix_for/";
const RAW_GITHUB_URL = "https://raw.githubusercontent.com/ethereumbook/ethereumbook/refs/heads/develop/src/chapter_17.md";
const GITHUB_URL = "https://github.com/ethereumbook/ethereumbook/blob/develop/src/chapter_17.md";
const RESOLVED_GITHUB_URL = "https://raw.githubusercontent.com/ethereumbook/ethereumbook/develop/src/chapter_17.md";

let parseFile: typeof import("./importers").parseFile;
let parseWebLink: typeof import("./importers").parseWebLink;
let parsePastedText: typeof import("./importers").parsePastedText;

before(async () => {
  // Node ignores Mammoth's browser mappings. Exercise its real browser converter here.
  mock.method(mammoth, "convertToHtml", createRequire(import.meta.url)("mammoth/mammoth.browser.js").convertToHtml);
  ({ parseFile, parseWebLink, parsePastedText } = await import("./importers"));
});
after(() => mock.restoreAll());

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
      const response = new Response(body, { headers: { "content-type": contentType } });
      Object.defineProperty(response, "url", { value: url });
      return response;
    },
  });
  return () => {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    else Reflect.deleteProperty(globalThis, "fetch");
  };
}

test("loads the legacy PDF worker without native Promise.withResolvers", async () => {
  const workerPath = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const script = `
    const { parentPort } = require("node:worker_threads");
    delete Promise.withResolvers;
    import(${JSON.stringify(pathToFileURL(workerPath).toString())})
      .then(() => parentPort.postMessage(typeof Promise.withResolvers))
      .catch((error) => { throw error; });
  `;
  const worker = new Worker(script, { eval: true });
  try {
    const result = await new Promise<string>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    assert.equal(result, "function");
  } finally {
    await worker.terminate();
  }
});

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
    assert.equal(parsed.chapters.filter((chapter) => /^Chapter [IVXLCDM]+$/.test(chapter.title)).length, 17);
    assert.ok(parsed.blocks.length > 1_000);
    assert.ok(parsed.blocks.some((block) => block.text === "The Lion, the Witch and the Wardrobe"));
    assert.ok(parsed.blocks.some((block) => block.text === "Chapter I"));
    const chapter = parsed.chapters.find((item) => item.title === "Chapter III");
    assert.ok(chapter);
    const headings = parsed.blocks.slice(chapter.startBlockIndex, chapter.startBlockIndex + 2);
    assert.deepEqual(headings.map((block) => block.text), ["Chapter III", "Edmund and the Wardrobe"]);
    assert.ok(headings.every((block) => block.isHeading && block.chapterIndex === headings[0].chapterIndex));
    assert.ok(!parsed.chapters.some((item) => item.title === "Edmund and the Wardrobe"));
    assert.equal(parsed.blocks[chapter.startBlockIndex + 2].chapterIndex, headings[0].chapterIndex);
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
    assert.equal(result.parsed.format, "md");
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
    assert.equal(result.parsed.format, "md");
    assert.ok(result.parsed.blocks.some((block) => block.text.includes("Ethereum roadmap")));
  } finally {
    restoreFetch();
    restoreDom();
  }
});

const prose = "This is a readable paragraph about importing documents, retaining their original format, and saving them for offline reading.";
const articleHtml = `<!doctype html><html lang="en"><head><title>An article</title></head><body><article><h1>An article</h1><p>${prose}</p><p>A second paragraph explains why a download should be identified by its actual content, even when a server supplies an unhelpful file name or content type.</p></article></body></html>`;

test("imports text and HTML aliases, Markdown aliases, MIME-only files, and encoded text", async () => {
  const restoreDom = installDom();
  try {
    for (const extension of ["txt", "text", "TXT"]) {
      const parsed = await parseFile(new File([prose], `document.${extension}`));
      assert.equal(parsed.format, "txt");
      assert.equal(parsed.blocks[0].text, prose);
    }
    for (const extension of ["html", "htm", "xhtml", "HTML"]) {
      const parsed = await parseFile(new File([articleHtml], `document.${extension}`));
      assert.equal(parsed.format, "html");
      assert.equal(fileTypeHint(`document.${extension}`), "html");
    }
    for (const extension of ["md", "markdown", "mdown", "mkd", "MD"]) {
      const parsed = await parseFile(new File([chapterMarkdown], `document.${extension}`, { type: "text/plain" }));
      assert.equal(parsed.format, "md");
      assert.equal(parsed.title, "Chapter 17. Zero-Knowledge Proofs");
    }
    assert.equal((await parseFile(new File([chapterMarkdown], "download", { type: "text/markdown" }))).format, "md");
    assert.equal((await parseFile(new File([articleHtml], "download", { type: "application/octet-stream" }))).format, "html");
    assert.equal((await parseFile(new File([prose], "download"))).format, "txt");
    const encoded = new File([new Uint8Array([0xff, 0xfe]), Buffer.from("A café serves coffee beside the reading room.", "utf16le")], "unicode.txt");
    assert.equal((await parseFile(encoded)).blocks[0].text, "A café serves coffee beside the reading room.");
    const legacy = new File([Buffer.from('<html><head><meta charset="windows-1252"></head><body><p>A café serves coffee beside the reading room.</p></body></html>', "latin1")], "legacy.html");
    assert.equal((await parseFile(legacy)).blocks[0].text, "A café serves coffee beside the reading room.");
  } finally { restoreDom(); }
});

async function docxBytes(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${prose}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

test("DOCX conversion keeps DOCX as the source format, including an unnamed ZIP download", async () => {
  const restoreDom = installDom();
  try {
    const bytes = await docxBytes();
    for (const name of ["document.docx", "download.bin"]) {
      const parsed = await parseFile(new File([bytes], name));
      assert.equal(parsed.format, "docx");
      assert.equal(parsed.blocks[0].text, prose);
    }
  } finally { restoreDom(); }
});

test("pasted HTML and Markdown retain their format and reject headings-only content", () => {
  const restoreDom = installDom();
  try {
    assert.equal(parsePastedText(articleHtml, "Pasted").format, "html");
    assert.equal(parsePastedText(chapterMarkdown, "Pasted").format, "md");
    assert.equal(parsePastedText(prose, "Pasted").format, "txt");
    for (const [text, format] of [["<h1>Heading</h1>", "html"], ["# Heading", "md"], ["CHAPTER I", "txt"]]) {
      assert.throws(() => parsePastedText(text, "Pasted"), (error: unknown) => error instanceof ImportError && error.fileType === format && error.category === "insufficient_content");
    }
  } finally { restoreDom(); }
});

test("HTML extraction omits scripts and duplicate nested list/quote paragraphs", async () => {
  const restoreDom = installDom();
  try {
    const parsed = await parseFile(new File([`<html><body><script>unreadable script</script><p hidden>hidden text</p><ul><li><p>${prose}</p></li></ul><blockquote><p>A quoted paragraph belongs in the reader only once.</p></blockquote></body></html>`], "document.html"));
    assert.equal(parsed.blocks.length, 2);
    assert.equal(parsed.blocks[0].text, `- ${prose}`);
    assert.equal(parsed.blocks[1].text, '"A quoted paragraph belongs in the reader only once."');
    await assert.rejects(parseFile(new File(["<html><body><script>Only a script</script></body></html>"], "script.html")), { code: "no_readable_text" });
  } finally { restoreDom(); }
});

test("empty, unsupported, mislabeled, and corrupt files fail with actionable categories", { timeout: 5_000 }, async () => {
  const restoreDom = installDom(true);
  try {
    await assert.rejects(parseFile(new File([], "empty.txt")), { category: "insufficient_content", fileType: "txt" });
    await assert.rejects(parseFile({ name: "large.pdf", size: MAX_IMPORT_BYTES + 1 } as File), { category: "file_too_large", fileType: "pdf" });
    await assert.rejects(parseFile(new File([new Uint8Array([0, 1, 2, 3])], "binary.txt")), { category: "unsupported" });
    await assert.rejects(parseFile(new File(['{"text":"Not a supported document"}'], "data.json", { type: "application/json" })), { code: "unsupported_format", fileType: "unknown" });
    for (const extension of ["pdf", "epub", "docx"]) {
      await assert.rejects(parseFile(new File([articleHtml], `error.${extension}`)), { code: "format_mismatch", fileType: extension });
    }
    await assert.rejects(parseFile(new File(["%PDF-1.7\nBroken file"], "broken.pdf")), { category: "conversion", fileType: "pdf" });
    const zip = new JSZip();
    zip.file("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="missing.opf"/></rootfiles></container>');
    await assert.rejects(parseFile(new File([await zip.generateAsync({ type: "arraybuffer" })], "broken.epub")), { category: "conversion", fileType: "epub" });
  } finally { restoreDom(); }
});

test("URL downloads use final URL, MIME, content disposition, and file signatures", async (t) => {
  const restoreDom = installDom();
  try {
    const cases = [
      { url: "https://example.com/file.MARKDOWN", type: "text/plain", body: chapterMarkdown, format: "md" },
      { url: "https://example.com/download", type: "text/plain", body: prose, format: "txt" },
      { url: "https://example.com/article", type: "text/html", body: articleHtml, format: "html" },
      { url: "https://example.com/download", type: "application/octet-stream", body: await docxBytes(), format: "docx" },
      { url: "https://example.com/download", type: "text/plain", body: chapterMarkdown, format: "md", disposition: "attachment; filename*=UTF-8''chapter.mkd" },
    ];
    for (const entry of cases) {
      const calls: string[] = [];
      t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        calls.push(String(input));
        const response = new Response(entry.body, { headers: { "Content-Type": entry.type, ...(entry.disposition ? { "Content-Disposition": entry.disposition } : {}) } });
        Object.defineProperty(response, "url", { value: entry.url });
        return response;
      });
      const result = await parseWebLink(" https://example.com/redirect ");
      assert.equal(result.parsed.format, entry.format);
      assert.equal(result.sourceUrl, entry.url);
      assert.equal(calls.length, 1);
      t.mock.restoreAll();
    }
  } finally { restoreDom(); }
});

test("a PDF URL is parsed as a PDF even with a generic download name", { timeout: 30_000 }, async (t) => {
  const file = await fixtureFile(JANE_EYRE);
  const bytes = await file.arrayBuffer();
  t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  const result = await parseWebLink("https://example.com/download");
  assert.equal(result.parsed.format, "pdf");
  assert.ok(result.parsed.blocks.length > 1_000);
});

test("binary, unsupported, and empty URL documents do not fall through to article extraction", async (t) => {
  const restoreDom = installDom();
  try {
    for (const [url, body, type] of [
      ["https://example.com/book.pdf", "bad PDF", "application/pdf"],
      ["https://example.com/file.json", "{}", "application/json"],
      ["https://example.com/file.md", "# Only a heading", "text/plain"],
      ["https://example.com/file.txt", "   ", "text/plain"],
    ]) {
      let calls = 0;
      t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response(body, { headers: { "content-type": type } }); });
      await assert.rejects(parseWebLink(url), ImportError);
      assert.equal(calls, 1);
      t.mock.restoreAll();
    }
  } finally { restoreDom(); }
});

test("URL validation rejects invalid or non-web addresses before fetching", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  for (const url of ["", "not a URL", "ftp://example.com/file", "javascript:alert(1)", "https://user:password@example.com"]) {
    await assert.rejects(parseWebLink(url), { code: "invalid_url", stage: "validation", fileType: "unknown" });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("fallback handles CORS failures, validates payloads, and retains both failure contexts", async (t) => {
  const fallbackCases = [
    { status: 200, payload: { text: prose, title: "Recovered", source_url: "not a valid URL" }, success: true },
    { status: 503, payload: { error: "URL fallback is not configured" }, category: "configuration" },
    { status: 422, payload: { error: "no_readable_content" }, category: "insufficient_content" },
    { status: 403, payload: { error: "access_denied" }, category: "restricted" },
    { status: 504, payload: { error: "timeout" }, category: "timeout" },
    { status: 200, payload: { text: 12 }, category: "invalid_response" },
    { status: 200, payload: { text: "   " }, category: "insufficient_content" },
    { status: 200, payload: null, category: "invalid_response" },
  ];
  for (const entry of fallbackCases) {
    const calls: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input) !== "/api/import-url") throw new TypeError("Failed to fetch");
      return Response.json(entry.payload, { status: entry.status });
    });
    if (entry.success) {
      const result = await parseWebLink("https://example.com/article");
      assert.equal(result.parsed.format, "html");
      assert.equal(result.parsed.title, "Recovered");
      assert.equal(result.sourceUrl, "https://example.com/article");
    } else {
      await assert.rejects(parseWebLink("https://example.com/article"), (error: unknown) => {
        assert.ok(error instanceof ImportError);
        assert.equal(error.category, entry.category);
        const properties = importFailureProperties(error, { source: "url", fileType: "unknown", stage: "direct_fetch" });
        assert.equal(properties.source, "url");
        assert.equal(properties.error_stage, "fallback");
        assert.equal(properties.direct_error_category, "network");
        assert.ok(!JSON.stringify(properties).includes("example.com"));
        return true;
      });
    }
    assert.deepEqual(calls, ["https://example.com/article", "/api/import-url"]);
    t.mock.restoreAll();
  }
});

test("HTML error responses and network/timeouts from the fallback never become unknown JSON errors", async (t) => {
  for (const failure of ["html", "network", "timeout"]) {
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/import-url") return new Response("Access denied", { status: 403 });
      if (failure === "network") throw new TypeError("Load failed");
      if (failure === "timeout") throw new DOMException("Aborted", "TimeoutError");
      return new Response("<html><body>Bad gateway</body></html>", { status: 502 });
    });
    await assert.rejects(parseWebLink("https://example.com/article"), (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.equal(error.category, failure === "timeout" ? "timeout" : "network");
      assert.equal(error.directError?.status, 403);
      assert.equal(error.fileType, "unknown");
      return true;
    });
    t.mock.restoreAll();
  }
});

test("article fallback preserves a known text or Markdown source format", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (String(input) !== "/api/import-url") throw new TypeError("Failed to fetch");
    return Response.json({ text: prose, title: "Recovered" });
  });
  for (const format of ["txt", "md"]) {
    assert.equal((await parseWebLink(`https://example.com/document.${format}`)).parsed.format, format);
  }
});

test("URL size limits and interrupted response bodies keep their failure category", async (t) => {
  let cancelled = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      headers: { "content-length": String(MAX_IMPORT_BYTES + 1), "content-type": "application/pdf" },
    });
  });
  await assert.rejects(parseWebLink("https://example.com/document.pdf"), { category: "file_too_large", fileType: "pdf" });
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (String(input) !== "/api/import-url") throw new TypeError("Failed to fetch");
    return new Response(new ReadableStream({ start(controller) { controller.error(new DOMException("Timed out reading the body", "TimeoutError")); } }));
  });
  await assert.rejects(parseWebLink("https://example.com/article"), { category: "timeout", stage: "fallback" });
});
