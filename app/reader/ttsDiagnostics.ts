export function ttsLog(event: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "production") console.debug(`[TTS] ${event}`, details);
}

export function errorReason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export class SpeechCancelledError extends Error {}
