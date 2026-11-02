import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";
import { sitePages, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = sitePages.map((page) => ({
    url: `${siteUrl}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
  const posts = await getPublishedPosts().catch(() => []);
  return [
    ...pages,
    ...posts.map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
