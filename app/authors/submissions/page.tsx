import type { Metadata } from "next";
import PublishingStudio from "../PublishingStudio";

export const metadata: Metadata = {
  title: "Submit a book", description: "Submit your book to FreeReader so readers can read or listen in their browser.",
};

export default function SubmissionsPage() { return <PublishingStudio />; }
