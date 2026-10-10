// app/[lang]/blog/[slug]/metadata.ts
import { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { getPostBySlug } from "@/lib/blog";
import {
  buildOpenGraphImages,
  buildTwitterCard,
  OG_DEFAULT_IMAGE_ALT,
} from "@/lib/seo/jsonld";
import { generateMetadata as generateBlogMetadata } from "../metadata";
import { supportedLocales } from "@/constants/i18n-config";
import type { Messages } from "@/types/messages";
import type { Locale } from "@/constants/i18n-config";

export async function generateMetadata({
  params,
}: {
  params: { slug: string; lang: string };
}): Promise<Metadata> {
  const lang = params.lang as Locale;
  const post = await getPostBySlug(params.slug, lang);

  if (!post) {
    //blog not found
    // Call the generateMetadata function of the blog homepage and pass in the parameters
    return generateBlogMetadata({ params: { lang } });
  }

   const messages = (await getMessages({ locale: lang })) as Messages;
   const blogWord = messages.text.navigation.blog;
  const blogCap = blogWord.charAt(0).toUpperCase() + blogWord.slice(1);

  // Each post ships its own cover image; fall back to the site-wide card.
  const coverImage = post.frontmatter.cover || undefined;

  return {
    title: `${post.frontmatter.title} | PrivyDrop ${blogCap}`,
    description: post.frontmatter.description,
    keywords: `${post.frontmatter.tags.join(
      ", "
    )}, secure file sharing, p2p transfer, privacy`,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${lang}/blog/${params.slug}`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog/${params.slug}`])
      ),
    },
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      url: `https://www.privydrop.app/${lang}/blog/${params.slug}`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "article",
      publishedTime: post.frontmatter.date,
      modifiedTime: post.frontmatter.date,
      authors: post.frontmatter.author,
      images: [
        {
          ...buildOpenGraphImages(coverImage),
          alt: post.frontmatter.title || OG_DEFAULT_IMAGE_ALT,
        },
      ],
    },
    twitter: buildTwitterCard(coverImage),
  };
}
