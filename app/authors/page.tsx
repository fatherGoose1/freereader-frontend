import type { Metadata } from "next";
import PublishingStudio from "./PublishingStudio";

export const metadata: Metadata = {
  title: "Publish your book", description: "Share your book with a free read-aloud link. Readers can read or listen in their browser, with no account required.",
};
export default function AuthorsPage() { return <PublishingStudio />; }
