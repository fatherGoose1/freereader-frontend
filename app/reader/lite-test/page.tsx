import type { Metadata } from "next";
import LiteTest from "./LiteTest";

export const metadata: Metadata = { title: "Light voice test" };

export default function Page() {
  return <LiteTest />;
}
