import { MAX_IMPORT_BYTES } from "../../reader/importFormats";

export function validIdentifier(identifier: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(identifier) && identifier.length <= 150;
}

export async function archiveMetadata(identifier: string): Promise<{ status: number; data?: Record<string, unknown> }> {
  if (!validIdentifier(identifier)) return { status: 400 };
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { status: 502 };
  if (!response.ok) return { status: response.status === 404 ? 404 : 502 };
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!data || !Array.isArray(data.files)) return { status: 404 };
  const info = data.metadata as Record<string, unknown> | undefined;
  const lending = data.lendingInfo as Record<string, unknown> | undefined;
  const blocked = (value: unknown) => value === true || value === "true" || value === "1";
  if (blocked(data.is_restricted) || blocked(data.is_lending) || blocked(lending?.is_lending)
    || blocked(info?.["access-restricted-item"])) return { status: 403 };
  return { status: 200, data };
}

export function allowedFile(data: Record<string, unknown>, name: string): { name: string; size?: string } | undefined {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return;
  const files = data.files as Array<{ name?: string; size?: string; private?: boolean | string }>;
  const file = files.find((entry) => entry.name === name && entry.private !== true && entry.private !== "true" && entry.private !== "1");
  if (!file || !/(?:\.txt|_djvu\.xml|\.epub|\.pdf|(?:__ia_thumb|_thumb|cover)\.(?:jpe?g|png))$/i.test(name)) return;
  if (Number(file.size) > MAX_IMPORT_BYTES) return;
  return { name, size: file.size };
}
