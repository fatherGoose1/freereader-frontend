export const MAX_STAFF_ROWS = 100;
export const MAX_STAFF_FILE_BYTES = 1024 * 1024;
export type StaffRecord = { name: string; email: string };
export type StaffIssue = { index: number; field: "name" | "email"; message: string };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const nameHeaders = new Set(["name", "fullname", "displayname", "staffname", "teachername", "employeename"]);
const emailHeaders = new Set(["email", "emailaddress", "workemail", "schoolemail", "googleemail", "staffemail"]);

export function normalizeStaff(record: StaffRecord): StaffRecord {
  return { name: record.name.trim().replace(/\s+/g, " "), email: record.email.trim().toLowerCase() };
}

function cells(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  const field = () => { row.push(value.trim()); value = ""; closed = false; };
  const finish = () => { field(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') { quoted = false; closed = true; }
      else value += character;
    } else if (character === delimiter) field();
    else if (character === "\n" || character === "\r") { finish(); if (character === "\r" && text[index + 1] === "\n") index += 1; }
    else if (character === '"' && !value.trim() && !closed) { value = ""; quoted = true; }
    else if (closed && character.trim()) throw new Error("The file has text after a closing quote. Check its CSV formatting.");
    else value += character;
  }
  if (quoted) throw new Error("The file contains an unclosed quoted field.");
  finish(); return rows;
}

export function parseStaffRecords(input: string): StaffRecord[] {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("No names or email addresses were found.");
  let chosen: string[][] | null = null, score = -1;
  for (const delimiter of ["\t", ",", ";", "|"]) {
    try {
      const rows = cells(text, delimiter); if (!rows.length) continue;
      const headers = rows[0].map(key);
      const hasName = headers.some((header) => nameHeaders.has(header)) || (headers.includes("firstname") && headers.includes("lastname"));
      const hasEmail = headers.some((header) => emailHeaders.has(header));
      const value = hasName && hasEmail ? 100 : rows[0].length >= 2 ? 10 + rows[0].filter((value) => value.includes("@")).length : 0;
      if (value > score) { chosen = rows; score = value; }
    } catch { /* Another delimiter may be the actual CSV format. */ }
  }
  if (!chosen) throw new Error("The file could not be read. Check its CSV quotes and separators.");
  const headers = chosen[0].map(key);
  const name = headers.findIndex((header) => nameHeaders.has(header));
  const email = headers.findIndex((header) => emailHeaders.has(header));
  const first = headers.indexOf("firstname"), last = headers.indexOf("lastname");
  let records: StaffRecord[];
  if (email >= 0 && (name >= 0 || first >= 0 && last >= 0)) {
    records = chosen.slice(1).map((row) => ({ name: name >= 0 ? row[name] ?? "" : `${row[first] ?? ""} ${row[last] ?? ""}`, email: row[email] ?? "" }));
  } else if (headers.some((header) => nameHeaders.has(header) || emailHeaders.has(header))) {
    throw new Error("Include both a Name and an Email column in the file.");
  } else if (chosen[0].length >= 2) {
    records = chosen.map((row) => ({ name: row[0] ?? "", email: row[1] ?? "" }));
  } else {
    records = chosen.map(([line]) => {
      const pair = line.match(/^(.*?)\s+<?([^\s<>]+@[^\s<>]+)>?$/);
      if (!pair) throw new Error("Use Name and Email columns, separated by commas, tabs, semicolons, or pipes.");
      return { name: pair[1], email: pair[2] };
    });
  }
  records = records.map(normalizeStaff).filter((record) => record.name || record.email);
  if (!records.length) throw new Error("The file has headers but no staff records.");
  if (records.length > MAX_STAFF_ROWS) throw new Error(`Import up to ${MAX_STAFF_ROWS} staff members at a time.`);
  return records;
}

export function staffIssues(records: StaffRecord[]): StaffIssue[] {
  const issues: StaffIssue[] = []; const counts = new Map<string, number>();
  records.map(normalizeStaff).forEach((record) => { if (record.email) counts.set(record.email, (counts.get(record.email) ?? 0) + 1); });
  records.forEach((original, index) => {
    const record = normalizeStaff(original); if (!record.name && !record.email) return;
    if (!record.name || record.name.length > 200) issues.push({ index, field: "name", message: "Enter a name (up to 200 characters)." });
    if (!emailPattern.test(record.email) || record.email.length > 320 || /[\u0000-\u001f\u007f]/.test(record.email)) issues.push({ index, field: "email", message: "Enter a valid email address." });
    else if ((counts.get(record.email) ?? 0) > 1) issues.push({ index, field: "email", message: "This email appears more than once." });
  });
  return issues;
}

export function safeClipboardCell(value: string) {
  const clean = value.replace(/[\t\r\n]/g, " ");
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
