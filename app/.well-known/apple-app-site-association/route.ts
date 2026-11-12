// Apple fetches this without a filename extension or redirects. Only redemption
// links open the installed iOS app; the same URL remains a working web fallback.
export function GET() {
  return Response.json({
    applinks: {
      details: [{
        appIDs: ["5NN9SZ8QQK.com.prismapplab.freereader", "5NN9SZ8QQK.com.prismapplab.freereader.simulator"],
        components: [{ "/": "/reader/audiobooks", "?": { redeem: "*" } }],
      }],
    },
  }, { headers: { "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" } });
}
