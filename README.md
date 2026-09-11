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
- English speech: GPU/ORT capability probe, then full Kokoro on desktop WebGPU or quantized Kokoro on mobile WebGPU; Supertonic 3 WASM if the probe or Kokoro fails
- Supertonic speech: full FP32 on desktop, INT8 on mobile, both in a dedicated SIMD WASM worker; also used for the existing non-English languages
- Playback: play the first passage, then generate ahead while playback continues (30-second target, capped at four passages)
- Offline app shell: service worker and web app manifest

EPUBs, PDFs, document text, and audio are never uploaded. Project Gutenberg OPDS metadata and EPUB files are fetched directly from `www.gutenberg.org`. Supertonic model and selected voice assets are downloaded directly from Hugging Face on first use and retained locally.

## iOS parser parity

The web importer follows the iOS `DocumentImporter` block model: whitespace is normalized, plain-text headings use the same Roman numeral/chapter/all-caps rules, headings start chapters, and narration blocks are capped at 250 characters. Long paragraphs use the same preference order and scoring as iOS: sentence and quote boundaries first, then word boundaries, then character fallbacks, while minimizing block count and raggedness.

PDF pages retain source page numbers and line endings where PDF.js exposes them. EPUB spine items without headings receive fallback chapter names. HTML, DOCX, Markdown, lists, and block quotes map to the same heading/paragraph representation. Markdown front matter, code fences, raw HTML lines, and horizontal rules are omitted like they are on iOS. Web articles apply Readability followed by the iOS-style minimum-length, duplicate-block, link-density, and restricted-content checks.

Browser extraction is intentionally not byte-for-byte identical. PDF.js and PDFKit can return text in a different order for complex page layouts, Mammoth interprets DOCX styles instead of reading Word XML directly, and epub.js handles malformed packages differently from ZIPFoundation. Scanned PDFs still require OCR before import. Books imported before a parser update keep their existing local blocks until re-imported.

## URL fallback

File and direct-URL imports share format detection: PDF signatures, EPUB/DOCX ZIP contents, MIME types, filename aliases, and HTML content. Redirected URLs and exposed `Content-Disposition` filenames are supported. Text decoding honors BOMs and declared charsets. Imports are limited to 100 MB and must contain readable body text. DOCX and Markdown use HTML as an intermediate representation but retain `docx` and `md` as their document format; plain-text links retain `txt`.

Web-link imports first use a browser `fetch` with a 15-second timeout. Direct PDF, EPUB, and DOCX links use the same local parsers as uploaded files. For web pages, if CORS, page access, or article extraction prevents it, `/api/import-url` forwards only the URL to the existing Koko Flask endpoint at `/api/v1/parryt/article-extractions`. Binary download/parse failures do not use the article service; users can download and upload the file if browser access is blocked. Configure the server-side adapter with:

```bash
KOKO_BACKEND_URL=https://your-koko-backend.example
PARRYT_API_TOKEN=your-existing-parryt-token
```

The token is never exposed to browser JavaScript. The backend response contains readable article text only; cleanup and local storage remain in the browser. No file import, Gutenberg EPUB, or TTS request uses this route.

Import events include `source` (`file`, `url`, `paste`, or `project_gutenberg`). Failures report the detected format (or `unknown` when it cannot be determined), `error_category`, `error_code`, `error_stage`, and an HTTP status when available. Fallback failures also retain the direct-fetch error category/code/status. These properties contain no document text, filenames, or URLs. Historical URL-import failures were always labeled `html`, and historical successful TXT/Markdown links were also relabeled `html`; those old events cannot identify the original format or exact cause.

## Development

```bash
npm install
npm run dev
npm run build
```

## Browser speech routing

| Device | Usable WebGPU | GPU unavailable or unusable |
| --- | --- | --- |
| Desktop | Full Kokoro FP32, 325,532,232 bytes | Full Supertonic 3 FP32, ~398 MB, WASM |
| Mobile | Existing Kokoro quantized export, 92,361,116 bytes | Supertonic 3 INT8, 102,090,195 bytes, WASM |

Kokoro remains the English engine; the other supported languages use Supertonic. `narration.ts` owns routing and serializes generation across both workers. A Kokoro failure releases its sessions/device and terminates the worker before Supertonic loads, with no reload or intermediate error shown. English fallback maps female Kokoro voices to F1 and male voices to M3. The failed GPU route stays disabled for the page lifetime. Audio cache keys include the actual engine, variant, voice, and settings, including when fallback happens during synthesis.

Before downloading **any** Kokoro assets, `webgpuProbe.ts` checks worker `navigator.gpu`, requests an adapter and device, and runs a 101-byte ONNX MatMul with CPU fallback disabled. It verifies GPU-resident output and the computed result. This tests GPU execution and readback, not just API presence. It does not guarantee that every Kokoro operator or future allocation will succeed; initialization/inference errors still trigger Supertonic.

### iPhone/Safari findings

The previous mobile branch unconditionally imported `onnxruntime-web/wasm` and selected Kokoro WASM. It never tested WebGPU, so an iPhone 14 Pro on iOS 26 could not take the GPU route even if supported. This implementation issue explains the previous behavior; it was not evidence that the device lacked WebGPU or required a different model precision.

ORT remains pinned to **1.29.0**. Its `/webgpu` export now uses native WebGPU/Asyncify; FreeReader uses `/all` for its established **JSEP WebGPU** backend, with matching JSEP glue/WASM. Browser testing also exposed single-use adapters: after the explicit device check, JSEP must obtain a **fresh adapter** to create its own device. Reusing the consumed adapter failed in Chromium and WebKit. Both full FP32 Kokoro and the existing mobile quantized model retain their original precision; neither is gated on `shader-f16`.

Real Kokoro audio and the tiny GPU probe have been exercised in desktop-hosted, headed Chromium and WebKit. Physical iPhone 14 Pro/iOS 26 validation is still needed for device-specific performance, memory limits, and background suspension.

### WASM and buffering

`scripts/prepare-ort.mjs` copies the pinned standard/JSEP runtimes into `public/onnxruntime-web/1.29.0` before development/build. `next.config.ts` supplies COOP `same-origin` and COEP `require-corp` to documents and workers. Deployment proxies must preserve these headers. Model fetches use CORS; runtime glue and pthread workers are same-origin.

Both Supertonic variants use SIMD and graph optimization in a worker, with no nested ORT inference proxy. With `crossOriginIsolated` and `SharedArrayBuffer`, thread counts are capped at half the logical cores, at most **2 on mobile / 4 on desktop**; otherwise they use one thread. The denoising loop reuses output tensors as inputs and disposes intermediates. Kokoro transfers its finished WAV buffer; Supertonic posts an immutable Blob.

Generation starts on playback demand. Once the first passage plays, both device classes prefetch a bounded window (30-second target, at most four following passages). Pause/navigation invalidates the look-ahead loop; an already-running passage may finish. Entire documents are not generated upfront.

### Models and diagnostics

Mobile uses the [Soniqo INT8 export](https://huggingface.co/soniqo/Supertonic-3-ONNX-INT8) pinned at `11f5965fd0bc7dfb191a16d83772fc658a3c03d8`: 102,090,195 bytes of ONNX weights. This export derives from the same upstream Supertonic 3 revision used on desktop. Configuration and all ten voice styles still come from upstream revision `3cadd1ee6394adea1bd021217a0e650ede09a323`. Quantization can affect output quality; it is not bit-identical FP32 inference. Model weights retain their upstream OpenRAIL-M terms; see the linked model card.

Mobile classification includes iPhone, iPad (including desktop-mode Safari), and Android. It chooses the model size, not GPU eligibility. Model storage remains optional. Development console entries prefixed `[TTS]` include classification, GPU/adapter/device/probe results, exact fallback reasons, model/variant/bytes, provider, isolation/threads, inference time, generated duration, RTF (inference seconds / audio seconds), and playback-request-to-first-audio time including downloads and initialization. No document text is logged.

For generated audio, the backend/PostHog `first_playable_audio.time_to_first_playable_seconds` measures **synthesis start → playback start**, excluding GPU checks, downloads, and model/voice initialization. Workers send a `performance.timeOrigin + performance.now()` synthesis-start timestamp so the window can measure through audio handoff and playback. Cached audio retains request-to-playback timing because it has no synthesis step. Total cold-start latency remains separate in development diagnostics.

Run `npm test` for deterministic tests. For real browser inference:

```bash
npx playwright install chromium webkit
npm run build
RUN_MOBILE_TTS=1 TTS_HEADED=1 npm run test:mobile -- tests/browser/mobile-tts.spec.ts
```

Without `RUN_MOBILE_TTS`, routing/failure and bounded-pipeline tests avoid large downloads. With it, the tests exercise real full/mobile Kokoro and Supertonic models, validate non-silent WAV audio, and check cache reuse when storage survives navigation. `TTS_HEADED=1` permits hardware GPU testing; headless Chromium may return no adapter. WebKit's ephemeral automation contexts can evict Cache Storage on reload; the integration test also checks recovery from that eviction. These browser profiles do not reproduce physical iPhone memory limits or background suspension.
