import type { Metadata } from "next";
import MobileScanner from "./MobileScanner";

export const metadata: Metadata = {
  title: "Scan with your phone",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MobileScanPage() { return <MobileScanner />; }
