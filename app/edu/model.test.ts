import assert from "node:assert/strict";
import { test } from "node:test";
import { localDateTime, schoolTimeToUTC, schoolDate, eduPath } from "./model";

test("school scheduling uses the school timezone rather than the device timezone", () => {
  assert.equal(schoolTimeToUTC("2026-10-12T09:00", "America/New_York"), "2026-10-12T13:00:00.000Z");
  assert.equal(schoolTimeToUTC("2026-01-12T09:00", "America/New_York"), "2026-01-12T14:00:00.000Z");
  assert.equal(schoolTimeToUTC("2026-10-12T09:00", "Asia/Kolkata"), "2026-10-12T03:30:00.000Z");
  assert.equal(localDateTime("2026-10-12T13:00:00Z", "America/New_York"), "2026-10-12T09:00");
});

test("DST gaps and repeated wall-clock times do not silently schedule assignments", () => {
  assert.throws(() => schoolTimeToUTC("2026-03-08T02:30", "America/New_York"), /daylight saving/);
  assert.throws(() => schoolTimeToUTC("2026-11-01T01:30", "America/New_York"), /daylight saving/);
  assert.throws(() => schoolTimeToUTC("2026-02-30T09:00", "UTC"));
});

test("calendar days follow the school timezone across midnight", () => {
  assert.equal(schoolDate("2026-10-12T01:00:00Z", "America/Los_Angeles"), "2026-10-11");
  assert.equal(schoolDate("2026-10-12T01:00:00Z", "Asia/Tokyo"), "2026-10-12");
  assert.equal(eduPath("assignments/abc", "edu.freereader.io"), "/assignments/abc");
  assert.equal(eduPath("assignments/abc", "localhost"), "/edu/assignments/abc");
});
