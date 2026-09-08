# FreeReader frontend

The existing marketing site remains at `/`; the local-first web reader is at `/reader`.

## Local architecture

- EPUB: `epub.js`
- PDF text: PDF.js, including a locally bundled worker
- DOCX: Mammoth
- HTML and web articles: DOMParser and Mozilla Readability
- Markdown: a local parser mirroring the iOS app's readable-markdown rules
- Metadata, extracted blocks, and reading position: IndexedDB
- Supertonic models: optional OPFS cache; generated WAV chunks: OPFS with byte-based IndexedDB fallback
- Desktop speech: the original Supertonic 3 ONNX pipeline through ONNX Runtime Web, preferring WebGPU and falling back to WASM
- Mobile speech: a separate single-threaded WASM worker using quantized Supertonic 3 and the original voice styles
- Playback: browser audio APIs; desktop pre-generation is unchanged, mobile generates only requested passages
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

Desktop Supertonic 3 is roughly a 400 MB first-use download. Its existing WebGPU/WASM selection and model files are unchanged.

## Mobile speech

Mobile uses the [Soniqo INT8 export](https://huggingface.co/soniqo/Supertonic-3-ONNX-INT8) pinned at `11f5965fd0bc7dfb191a16d83772fc658a3c03d8`: 102,090,195 bytes of ONNX weights. This export derives from the same upstream Supertonic 3 revision used on desktop. Configuration and all ten voice styles still come from upstream revision `3cadd1ee6394adea1bd021217a0e650ede09a323`. Quantization can affect output quality; it is not bit-identical FP32 inference. Model weights retain their upstream OpenRAIL-M terms; see the linked model card.

`narration.ts` routes iPhone, iPad (including desktop-mode Safari), and Android to `mobileSpeech.worker.ts`. The desktop engine in `tts.ts` is unchanged. Mobile uses single-threaded WASM, bounded text chunks and predicted duration, explicit tensor disposal, separate audio cache keys, and no whole-book pre-generation. The worker is terminated after inactivity, page exit, errors, or a stalled operation. Model storage remains optional; no text is sent to a speech server and browser/device speech voices are not substituted.

Run `npm test` for deterministic tests. For real browser inference:

```bash
npx playwright install chromium webkit
npm run build
RUN_MOBILE_TTS=1 npm run test:mobile
```

The integration tests download the real pinned models, check generated WAV audio and playback in mobile-profile Chromium/WebKit, switch voices, and verify desktop model routing. These desktop-hosted browser tests do not reproduce physical iPhone memory limits or background suspension. iOS may still evict caches, suspend background work, or terminate a tab under device-wide memory pressure.
