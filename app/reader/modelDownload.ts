export async function downloadModel(
  url: string,
  expectedSize: number,
  progress?: (fraction: number) => void,
): Promise<Blob> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Model download failed (${response.status})`);
    let downloaded = 0;
    const tracker = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, stream) {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), 60_000);
        downloaded += chunk.byteLength;
        progress?.(downloaded / expectedSize);
        stream.enqueue(chunk);
      },
    });
    const blob = await (response.body ? new Response(response.body.pipeThrough(tracker)) : response).blob();
    if (blob.size !== expectedSize) throw new Error("Incomplete voice model download. Tap Play to retry.");
    return blob;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Voice model download stalled. Check your connection and tap Play to retry.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
