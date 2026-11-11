const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1200;
const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareCoverArt(file: File): Promise<Blob> {
  if (!SUPPORTED_IMAGES.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Choose an image smaller than 20 MB.");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("The image could not be opened.");
  }
  try {
    if (!image.width || !image.height) throw new Error("The image could not be opened.");
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image could not be processed.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const cover = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) =>
      blob ? resolve(blob) : reject(new Error("The image could not be processed.")), "image/jpeg", .82));
    if (cover.size > MAX_COVER_BYTES) throw new Error("The processed cover is too large. Choose a smaller image.");
    return cover;
  } finally {
    image.close();
  }
}
