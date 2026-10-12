import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStaffRecords, staffIssues, safeClipboardCell } from "./staffImport";

test("CSV supports quoted names, BOM, reordered headers, and extra columns", () => {
  assert.deepEqual(parseStaffRecords('\uFEFFEmail Address,Department,Full Name\r\nANA@SCHOOL.EDU,English,"Lopez, Ana"\r\n"bob@school.edu",Math,"Bob ""Bobby"" Smith"'), [
    { name: "Lopez, Ana", email: "ana@school.edu" }, { name: 'Bob "Bobby" Smith', email: "bob@school.edu" },
  ]);
});
test("spreadsheet paste and semicolon/text imports produce editable records", () => {
  assert.deepEqual(parseStaffRecords("Alice Smith\talice@school.edu\nBob Jones\tbob@school.edu"), [
    { name: "Alice Smith", email: "alice@school.edu" }, { name: "Bob Jones", email: "bob@school.edu" },
  ]);
  assert.deepEqual(parseStaffRecords("First Name;Last Name;School Email\nAlice;Smith;alice@school.edu"), [{ name: "Alice Smith", email: "alice@school.edu" }]);
  assert.deepEqual(parseStaffRecords("Alice Smith alice@school.edu"), [{ name: "Alice Smith", email: "alice@school.edu" }]);
});
test("bad rows remain visible for correction while malformed/oversized imports fail", () => {
  const rows = parseStaffRecords("Name,Email\nAlice,invalid\nBob,BOB@SCHOOL.EDU\nDuplicate,bob@school.edu");
  assert.equal(staffIssues(rows).filter((issue) => issue.field === "email").length, 3);
  assert.throws(() => parseStaffRecords("Name,Department\nAlice,Math"), /both/);
  assert.throws(() => parseStaffRecords('Name,Email\n"Unclosed,email@school.edu'), /quote|both/);
  assert.throws(() => parseStaffRecords("Name,Email\n" + Array.from({ length: 101 }, (_, index) => `Person ${index},p${index}@school.edu`).join("\n")), /100/);
  assert.equal(safeClipboardCell("=IMPORTXML(1)"), "'=IMPORTXML(1)");
});
