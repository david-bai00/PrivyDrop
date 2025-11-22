import { MetadataRoute } from "next";
import { supportedLocales } from "@/constants/i18n-config";
import { getAllPosts } from "@/lib/blog";
import { slugifyTag } from "@/utils/tagUtils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.privydrop.app";
  const languages = supportedLocales;
  const routes = [
    "",
    "/features",
    "/blog",
    "/about",
    "/help",
    "/faq",
    "/terms",
    "/privacy",
  ];

  const urls: MetadataRoute.Sitemap = [];

  // Add root URL
  urls.push({
    url: baseUrl,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1,
  });

  // Add language specific URLs, blog posts and tag pages
  for (const lang of languages) {
    try {
      const posts = await getAllPosts(lang);

      // compute latest blog post date for this language
      const latestDate = posts.length
        ? new Date(
            Math.max(
              ...posts.map((p) => new Date(p.frontmatter.date).getTime())
            )
          )
        : new Date();

      // Add static routes per language (optimize blog list lastModified)
      routes.forEach((route) => {
        const isRoot = route === "";
        const isBlogList = route === "/blog";
        urls.push({
          url: `${baseUrl}/${lang}${route}`,
          lastModified: isBlogList ? latestDate : new Date(),
          changeFrequency: isRoot ? "weekly" : isBlogList ? "weekly" : "weekly",
          priority: isRoot ? 1.0 : 0.8,
        });
      });

      // Add blog posts for this language
      posts.forEach((post) => {
        urls.push({
          url: `${baseUrl}/${lang}/blog/${post.slug}`,
          lastModified: new Date(post.frontmatter.date),
          changeFrequency: "monthly",
          priority: 0.7,
        });
      });

      // Add tag pages for this language
      const uniqueTags = Array.from(
        new Set(posts.flatMap((p) => p.frontmatter.tags))
      );
      uniqueTags.forEach((tag) => {
        const tagSlug = slugifyTag(tag);
        const tagLatestDate = posts
          .filter((p) => p.frontmatter.tags.includes(tag))
          .map((p) => new Date(p.frontmatter.date).getTime());
        const lastModified =
          tagLatestDate.length > 0
            ? new Date(Math.max(...tagLatestDate))
            : latestDate;
        urls.push({
          url: `${baseUrl}/${lang}/blog/tag/${tagSlug}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      });
    } catch (error) {
      console.warn(`Failed to load blog data for language ${lang}:`, error);
      // Fallback: keep at least the static routes
      routes.forEach((route) => {
        urls.push({
          url: `${baseUrl}/${lang}${route}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: route === "" ? 1.0 : 0.8,
        });
      });
    }
  }

  return urls;
}
