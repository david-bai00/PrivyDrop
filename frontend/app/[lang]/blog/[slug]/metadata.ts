// app/[lang]/blog/[slug]/metadata.ts
import { Metadata } from "next";
import { getPostBySlug } from "@/lib/blog";
import { generateMetadata as generateBlogMetadata } from "../metadata";
import { getDictionary } from "@/lib/dictionary";
import { supportedLocales } from "@/constants/i18n-config";

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

  const messages = await getDictionary(params.lang);
  const blogWord = messages.text.Header.Blog_dis;
  const blogCap = blogWord.charAt(0).toUpperCase() + blogWord.slice(1);

  return {
    title: `${post.frontmatter.title} | PrivyDrop ${blogCap}`,
    description: post.frontmatter.description,
    keywords: `${post.frontmatter.tags.join(
      ", "
    )}, secure file sharing, p2p transfer, privacy`,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${params.lang}/blog/${params.slug}`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog/${params.slug}`])
      ),
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
