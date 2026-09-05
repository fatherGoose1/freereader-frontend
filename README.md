# FreeReader frontend

The existing marketing site remains at `/`; the local-first web reader is at `/reader`.

## Local architecture

- EPUB: `epub.js`
- PDF text: PDF.js, including a locally bundled worker
- DOCX: Mammoth
- HTML and web articles: DOMParser and Mozilla Readability
- Markdown: a local parser mirroring the iOS app's readable-markdown rules
- Metadata, extracted blocks, and reading position: IndexedDB
- Imported source files, Supertonic models, and generated WAV chunks: OPFS with an IndexedDB fallback
- Speech: the official Supertonic 3 ONNX pipeline through ONNX Runtime Web, preferring WebGPU and falling back to WASM
- Playback: browser audio APIs; passages are generated and cached individually, with the next two prepared ahead
- Offline app shell: service worker and web app manifest

EPUBs, PDFs, document text, and audio are never uploaded. Project Gutenberg OPDS metadata and EPUB files are fetched directly from `www.gutenberg.org`. Supertonic model and selected voice assets are downloaded directly from Hugging Face on first use and retained locally.

## iOS parser parity

The web importer follows the iOS `DocumentImporter` block model: whitespace is normalized, plain-text headings use the same Roman numeral/chapter/all-caps rules, headings start chapters, and narration blocks are capped at 250 characters. Long paragraphs use the same preference order and scoring as iOS: sentence and quote boundaries first, then word boundaries, then character fallbacks, while minimizing block count and raggedness.

PDF pages retain source page numbers and line endings where PDF.js exposes them. EPUB spine items without headings receive fallback chapter names. HTML, DOCX, Markdown, lists, and block quotes map to the same heading/paragraph representation. Markdown front matter, code fences, raw HTML lines, and horizontal rules are omitted like they are on iOS. Web articles apply Readability followed by the iOS-style minimum-length, duplicate-block, link-density, and restricted-content checks.

Browser extraction is intentionally not byte-for-byte identical. PDF.js and PDFKit can return text in a different order for complex page layouts, Mammoth interprets DOCX styles instead of reading Word XML directly, and epub.js handles malformed packages differently from ZIPFoundation. Scanned PDFs still require OCR before import. Books imported before a parser update keep their existing local blocks until re-imported.

## URL fallback

Web-link imports first use a browser `fetch`. If CORS or page access prevents it, `/api/import-url` forwards only the URL to the existing Koko Flask endpoint at `/api/v1/parryt/article-extractions`. Configure the server-side adapter with:

```bash
KOKO_BACKEND_URL=https://your-koko-backend.example
PARRYT_API_TOKEN=your-existing-parryt-token
```

The token is never exposed to browser JavaScript. The backend response contains readable article text only; cleanup and local storage remain in the browser. No file import, Gutenberg EPUB, or TTS request uses this route.

## Development

```bash
npm install
npm run dev
npm run build
```

Supertonic 3 is roughly a 400 MB first-use download. Chromium desktop generally provides the best WebGPU performance. Browsers without a compatible WebGPU execution provider use WASM, which is slower and can be memory constrained. Safari and iOS may expose WebGPU while still rejecting an ONNX graph/operator; FreeReader catches initialization failure and retries with WASM. iOS can also evict site storage under pressure, pause generation in the background, and impose tighter memory limits than desktop browsers. Scanned/image-only PDFs require OCR before import.
