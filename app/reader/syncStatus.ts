import type { SyncResult } from "./accountSync";

export function syncLimitMessage({ localOnlyReasons, documentLimit }: SyncResult): string {
  const messages: string[] = [];
  const { documentLimit: atLimit, documentTooLarge, differentAccount } = localOnlyReasons;
  if (atLimit) messages.push(`Your account has reached its ${documentLimit}-book cloud limit; ${atLimit} ${atLimit === 1 ? "book remains" : "books remain"} on this device.`);
  if (documentTooLarge) messages.push(`${documentTooLarge} ${documentTooLarge === 1 ? "book exceeds" : "books exceed"} the 10 MiB compressed-book limit and ${documentTooLarge === 1 ? "remains" : "remain"} on this device.`);
  if (differentAccount) messages.push(`${differentAccount} ${differentAccount === 1 ? "book was" : "books were"} previously synced under a different account on this device and cannot sync to this account.`);
  return messages.join(" ");
}
