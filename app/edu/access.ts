import { createHash, timingSafeEqual } from "node:crypto";

// Front-door lock for the EDU preview. The password lives in EDU_ACCESS_PASSWORD;
// when it is unset the gate denies every request (default-deny).
export const EDU_ACCESS_COOKIE = "freereader-edu-access";

export function eduAccessToken(password: string): string {
  return createHash("sha256").update(`freereader-edu:${password}`).digest("hex");
}

export function eduAccessGranted(cookieValue: string | undefined): boolean {
  const password = process.env.EDU_ACCESS_PASSWORD;
  if (!password || !cookieValue) return false;
  const expected = Buffer.from(eduAccessToken(password));
  const actual = Buffer.from(cookieValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
