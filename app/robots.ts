import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ingest/", "/edu/", "/authors/dashboard", "/authors/edit/", "/authors/profile", "/reader/chrome-connect", "/reader/chrome-checkout"],
    }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
