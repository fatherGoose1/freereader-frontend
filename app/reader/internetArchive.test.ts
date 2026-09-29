import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";
import { DOMParser as LinkeDOMParser } from "linkedom";
import { allowedFile, archiveMetadata, validIdentifier } from "../api/internet-archive/archive";
import { archiveCandidates, archiveIdentifier, importInternetArchive, normalizeArchiveOcr } from "./internetArchive";
import { parseArchivePageXml } from "./importers";

test("recognizes only Archive details URLs and ranks public text before XML, EPUB and PDF", () => {
  assert.equal(archiveIdentifier("https://archive.org/details/example_book?view=theater"), "example_book");
  assert.equal(archiveIdentifier("https://www.archive.org/details/book-1/"), "book-1");
  assert.equal(archiveIdentifier("https://archive.org.evil.test/details/book"), undefined);
  assert.equal(archiveIdentifier("https://archive.org/details/book/other"), undefined);
  const files = ["book.pdf", "book.epub", "book_djvu.xml", "book.txt", "book_djvu.txt", "private_djvu.txt"]
    .map((name) => ({ name, private: name.startsWith("private") }));
  assert.deepEqual(archiveCandidates({ files }).map((file) => file.name),
    ["book_djvu.txt", "book.txt", "book_djvu.xml", "book.epub", "book.pdf"]);
  assert.throws(() => archiveCandidates({ is_restricted: true, files }), { category: "restricted" });
  assert.throws(() => archiveCandidates({ lendingInfo: { is_lending: true }, files }), { category: "restricted" });
  assert.equal(validIdentifier("book_123"), true);
  assert.equal(validIdentifier("../private"), false);
  assert.equal(allowedFile({ files }, "private_djvu.txt"), undefined);
  assert.equal(allowedFile({ files }, "../book.pdf"), undefined);
});

test("server does not expose lending items or private derivatives", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ lendingInfo: { is_lending: true }, files: [{ name: "scan_djvu.txt" }] });
  try {
    assert.equal((await archiveMetadata("scan")).status, 403);
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(allowedFile({ files: [{ name: "scan_djvu.txt", private: "true" }] }, "scan_djvu.txt"), undefined);
});

test("cleans scan artifacts without losing paragraph breaks", () => {
  assert.equal(normalizeArchiveOcr("Digitized by the Internet Archive\fA long para-\ngraph continues.\n\nAnother   paragraph.\n"),
    "A long paragraph continues.\n\nAnother paragraph.");
});

test("DjVu XML keeps original scan page numbers on chunked reading blocks", () => {
  const old = globalThis.DOMParser;
  globalThis.DOMParser = LinkeDOMParser as unknown as typeof DOMParser;
  try {
    const xml = `<DjVuXML><BODY><OBJECT><PARAM name="PAGE" value="scan_0007"/><HIDDENTEXT><PAGECOLUMN><REGION><PARAGRAPH><LINE><WORD>First</WORD><WORD>page.</WORD></LINE></PARAGRAPH></REGION></PAGECOLUMN></HIDDENTEXT></OBJECT><OBJECT><PARAM name="PAGE" value="scan_0008"/><HIDDENTEXT><PAGECOLUMN><REGION><PARAGRAPH><LINE><WORD>Second</WORD><WORD>page.</WORD></LINE></PARAGRAPH></REGION></PAGECOLUMN></HIDDENTEXT></OBJECT></BODY></DjVuXML>`;
    const parsed = parseArchivePageXml(xml, "A book", normalizeArchiveOcr);
    assert.deepEqual(parsed.blocks.map(({ text, page }) => [text, page]), [["First page.", 7], ["Second page.", 8]]);
  } finally { globalThis.DOMParser = old; }
});

test("imports the preferred public OCR derivative through the existing TXT parser", async () => {
  const oldFetch = globalThis.fetch;
  const oldFile = globalThis.File;
  globalThis.File = NodeFile as unknown as typeof File;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/internet-archive/example")) return Response.json({
      metadata: { title: "Example title", creator: "Example author", language: "eng" },
      files: [{ name: "example.pdf" }, { name: "example_djvu.txt" }],
    });
    return new Response("Some read-\nable words.\n\nMore text.");
  };
  try {
    const { parsed, identifier, sourceUrl } = await importInternetArchive("https://archive.org/details/example");
    assert.deepEqual(calls, ["/api/internet-archive/example", "/api/internet-archive/example/file?name=example_djvu.txt"]);
    assert.equal(identifier, "example");
    assert.equal(sourceUrl, "https://archive.org/details/example");
    assert.equal(parsed.title, "Example title");
    assert.equal(parsed.author, "Example author");
    assert.equal(parsed.language, "en");
    assert.equal(parsed.format, "txt");
    assert.deepEqual(parsed.blocks.map((block) => block.text), ["Some readable words.", "More text."]);
  } finally { globalThis.fetch = oldFetch; globalThis.File = oldFile; }
});

test("reports missing readable derivatives and restricted items clearly", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ files: [{ name: "scan.jp2" }] });
  try {
    await assert.rejects(importInternetArchive("https://archive.org/details/scan"), { code: "archive_no_text" });
  } finally { globalThis.fetch = oldFetch; }
});
