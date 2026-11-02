import Link from "next/link";

export default function ChromeCheckout() {
  return <main style={{ maxWidth: 540, margin: "90px auto", padding: 24, fontFamily: "system-ui", color: "#365bd6" }}>
    <h1>Return to FreeReader</h1>
    <p>Open the Chrome side panel to see your subscription status. Gold activates after Stripe confirms your subscription; this page doesn’t grant access.</p>
    <p>If you cancelled checkout, you can try again from the extension.</p>
    <Link href="/reader/audiobooks">Explore FreeReader →</Link>
  </main>;
}
