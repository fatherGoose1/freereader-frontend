import assert from "node:assert/strict";
import test from "node:test";
import { prepareCoverArt } from "./coverArt";

test("selected cover art is resized, flattened, and encoded as a syncable JPEG", async (t) => {
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let closed = false;
  let drawn = false;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect: (x: number, y: number, width: number, height: number) => {
        assert.deepEqual([x, y, width, height], [0, 0, 1200, 800]);
      },
      drawImage: () => { drawn = true; },
    }),
    toBlob: (callback: (blob: Blob) => void, type: string, quality: number) => {
      assert.equal(type, "image/jpeg");
      assert.equal(quality, .82);
      callback(new Blob(["jpeg cover"], { type }));
    },
  };
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 2400, height: 1600, close: () => { closed = true; } }) });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => {
    assert.equal(tag, "canvas");
    return canvas;
  } } });
  t.after(() => {
    if (originalBitmap) Object.defineProperty(globalThis, "createImageBitmap", originalBitmap);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  const cover = await prepareCoverArt(new File(["image bytes"], "cover.png", { type: "image/png" }));
  assert.equal(await cover.text(), "jpeg cover");
  assert.deepEqual([canvas.width, canvas.height], [1200, 800]);
  assert.equal(drawn, true);
  assert.equal(closed, true);
});

test("cover art rejects unsupported and oversized files before decoding", async () => {
  await assert.rejects(prepareCoverArt(new File(["text"], "cover.txt", { type: "text/plain" })), /JPG, PNG, or WebP/);
  const tooLarge = new File(["image bytes"], "cover.png", { type: "image/png" });
  Object.defineProperty(tooLarge, "size", { value: 21 * 1024 * 1024 });
  await assert.rejects(prepareCoverArt(tooLarge), /smaller than 20 MB/);
});
