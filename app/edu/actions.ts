"use server";

import { cookies } from "next/headers";
import { EDU_ACCESS_COOKIE, eduAccessToken } from "./access";

export type EduUnlockState = { ok: boolean; message?: string };

const WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function unlockEdu(_state: EduUnlockState | null, formData: FormData): Promise<EduUnlockState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.EDU_ACCESS_PASSWORD;
  if (!expected) return { ok: false, message: "EDU access is not configured yet." };
  if (password !== expected) return { ok: false, message: "Incorrect password. Try again." };
  const store = await cookies();
  store.set(EDU_ACCESS_COOKIE, eduAccessToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK_SECONDS,
  });
  return { ok: true };
}
