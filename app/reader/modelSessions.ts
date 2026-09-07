// Keep only one downloaded model Blob alive while creating inference sessions.
export async function loadModelSessions<T extends { release(): Promise<void> }>(
  assets: readonly (readonly [string, number])[],
  load: (path: string, size: number) => Promise<Blob>,
  create: (url: string, path: string) => Promise<T>,
): Promise<T[]> {
  const sessions: T[] = [];
  try {
    for (const [path, size] of assets) {
      const url = URL.createObjectURL(await load(path, size));
      try {
        sessions.push(await create(url, path));
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return sessions;
  } catch (error) {
    await Promise.allSettled(sessions.map((session) => session.release()));
    throw error;
  }
}
