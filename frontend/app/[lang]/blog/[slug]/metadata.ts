// app/[lang]/blog/[slug]/metadata.ts
import { Metadata } from "next";
import { getPostBySlug } from "@/lib/blog";
import { generateMetadata as generateBlogMetadata } from "../metadata";

export async function generateMetadata({
  params,
}: {
  params: { slug: string; lang: string };
}): Promise<Metadata> {
  const post = await getPostBySlug(params.slug, params.lang);

  if (!post) {
    //blog not found
    // Call the generateMetadata function of the blog homepage and pass in the parameters
    return generateBlogMetadata({ params: { lang: params.lang } });
  }

  return {
    title: `${post.frontmatter.title} | PrivyDrop Blog`,
    description: post.frontmatter.description,
    keywords: `${post.frontmatter.tags.join(
      ", "
    )}, secure file sharing, p2p transfer, privacy`,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/blog/${params.slug}`,
      languages: {
        en: `/en/blog/${params.slug}`,
        zh: `/zh/blog/${params.slug}`,
      },
    },
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      url: `https://www.privydrop.app/${params.lang}/blog/${params.slug}`,
      siteName: "PrivyDrop",
      locale: params.lang,
      type: "article",
      publishedTime: post.frontmatter.date,
      modifiedTime: post.frontmatter.date,
      authors: post.frontmatter.author,
    },
  };
}
