import { MetadataRoute } from "next";
import { supportedLocales } from "@/constants/i18n-config";

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

  return urls;
}
