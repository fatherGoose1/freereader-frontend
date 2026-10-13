export type Role = "admin" | "teacher" | "student";
export type School = { id: string; name: string; timezone: string; role: Role };
export type Classroom = { id: string; name: string; term: string };
export type Assignment = {
  id: string; schoolId: string; title: string; instructions: string; createdBy: string; creatorEmail?: string;
  status: "draft" | "published" | "archived"; availableAt: string; dueAt: string;
  closesAt: string | null; classIds: string[]; versionIds: string[]; revision: number; canManage?: boolean;
};
export type DocumentVersion = {
  id: string; documentId: string; title: string; format: "pdf" | "epub" | "docx" | "txt" | "html" | "md";
  filename: string; status: "pending" | "ready"; blockCount: number; originalBytes: number; readingBytes: number; createdBy: string;
};
export type Progress = { userId: string; versionId: string; blockIndex: number; offsetSeconds: number; speed: number; updatedAt: string; completedAt: string | null };

export function eduPath(path = "", hostname?: string) {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const clean = path.replace(/^\/+/, "");
  // Configurable host is supplied by EduProvider; this default is also useful in tests.
  return `${host === "edu.freereader.io" ? "" : "/edu"}${clean ? `/${clean}` : "/"}`;
}

export function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function schoolDate(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function localDateTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Resolve wall-clock school times explicitly. Reject DST gaps/ambiguities rather
// than silently scheduling for a different time or using the teacher's device zone.
export function schoolTimeToUTC(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const wall = Date.parse(`${value}:00Z`);
  const candidates = new Set<string>();
  for (let hours = -24; hours <= 24; hours += 6) {
    const sample = new Date(wall + hours * 3600_000);
    const formatted = localDateTime(sample.toISOString(), timezone);
    const offset = Date.parse(`${formatted}:00Z`) - Math.floor(sample.getTime() / 60_000) * 60_000;
    const candidate = new Date(wall - offset).toISOString();
    if (localDateTime(candidate, timezone) === value) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error("This time is skipped or repeated by daylight saving. Choose another time.");
  return [...candidates][0];
}
