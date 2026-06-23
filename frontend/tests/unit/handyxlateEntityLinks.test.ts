import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { describe, expect, it } from "vitest";

import { supportedLocales } from "@/constants/i18n-config";
import { de } from "@/constants/messages/de";
import { en } from "@/constants/messages/en";
import { es } from "@/constants/messages/es";
import { fr } from "@/constants/messages/fr";
import { ja } from "@/constants/messages/ja";
import { ko } from "@/constants/messages/ko";
import { zh } from "@/constants/messages/zh";

const localeMessages = {
  de,
  en,
  es,
  fr,
  ja,
  ko,
  zh,
} as const;

const blogSlug = "browser-sharing-vs-screen-translation";
const expectedHandyxlateUrl = "https://www.handyxlate.app";

describe("HandyXlate entity links", () => {
  it("provides About-page entity relationship copy for every supported locale", () => {
    for (const locale of supportedLocales) {
      const otherProjects = (localeMessages[locale].text.about as any)
        .otherProjects;

      expect(otherProjects, `${locale} should define about.otherProjects`).toBeTruthy();
      expect(otherProjects.title, `${locale} should define about.otherProjects.title`).toBeTruthy();
      expect(otherProjects.description, `${locale} should define about.otherProjects.description`).toBeTruthy();
      expect(otherProjects.linkLabel, `${locale} should define about.otherProjects.linkLabel`).toBeTruthy();
    }
  });

  it("ships the new contextual blog post in every supported locale", () => {
    const postsPath = path.join(
      process.cwd(),
      "content/blog",
      blogSlug
    );

    for (const locale of supportedLocales) {
      const filePath = path.join(postsPath, `${locale}.mdx`);

      expect(fs.existsSync(filePath), `${locale} blog post should exist`).toBe(
        true
      );

      const source = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(source);

      expect(data.status, `${locale} blog post should be published`).toBe(
        "published"
      );
      expect(
        content.includes(expectedHandyxlateUrl),
        `${locale} blog post should link to HandyXlate`
      ).toBe(true);
    }
  });

  it("uses the existing emphasized inline-link style for HandyXlate mentions", () => {
    const postsPath = path.join(process.cwd(), "content/blog", blogSlug);

    for (const locale of supportedLocales) {
      const filePath = path.join(postsPath, `${locale}.mdx`);
      const source = fs.readFileSync(filePath, "utf8");
      const { content } = matter(source);

      expect(
        content.includes("[<u>**HandyXlate"),
        `${locale} blog post should use emphasized HandyXlate links`
      ).toBe(true);
    }
  });
});
