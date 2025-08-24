import { MetadataRoute } from "next";
import { supportedLocales } from "@/constants/i18n-config";
import { getAllPosts } from "@/lib/blog";

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

  // Add language specific URLs
  languages.forEach((lang) => {
    routes.forEach((route) => {
      urls.push({
        url: `${baseUrl}/${lang}${route}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: route === "" ? 1.0 : 0.8,
      });
    });
  });

  // Add blog posts for each language
  for (const lang of languages) {
    try {
      const posts = await getAllPosts(lang);
      
      posts.forEach((post) => {
        urls.push({
          url: `${baseUrl}/${lang}/blog/${post.slug}`,
          lastModified: new Date(post.frontmatter.date),
          changeFrequency: "monthly",
          priority: 0.7,
        });
      });
    } catch (error) {
      console.warn(`Failed to load blog posts for language ${lang}:`, error);
    }
  }

  return urls;
}
