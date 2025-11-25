//Article detail page
import { MDXRemote } from "next-mdx-remote/rsc";
import { getPostBySlug } from "@/lib/blog";
import * as React from "react";
import { mdxOptions } from "@/lib/mdx-config";
import { mdxComponents } from "@/components/blog/MDXComponents";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { generateMetadata } from "./metadata";
import JsonLd from "@/components/seo/JsonLd";
import {
  absoluteUrl,
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  getSiteUrl,
} from "@/lib/seo/jsonld";
import { getDictionary } from "@/lib/dictionary";

export { generateMetadata };

export default async function BlogPost({
  params,
}: {
  params: { slug: string; lang: string };
}) {
  const post = await getPostBySlug(params.slug, params.lang);
  const messages = await getDictionary(params.lang);

  if (!post) {
    return <div>{messages.text.blog.post_not_found}</div>;
  }

  const siteUrl = getSiteUrl();
  const postUrl = `${siteUrl}/${params.lang}/blog/${params.slug}`;
  const imageUrl = absoluteUrl(post.frontmatter.cover, siteUrl);
  const postLd = buildBlogPostingJsonLd({
    siteUrl,
    url: postUrl,
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    datePublished: post.frontmatter.date,
    dateModified: post.frontmatter.date,
    authorName: post.frontmatter.author,
    imageUrl,
    inLanguage: params.lang,
  });
  const breadcrumbsLd = buildBreadcrumbJsonLd({
    items: [
      { name: messages.text.Header.Home_dis, item: `${siteUrl}/${params.lang}` },
      { name: messages.text.Header.Blog_dis, item: `${siteUrl}/${params.lang}/blog` },
      { name: post.frontmatter.title, item: postUrl },
    ],
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <JsonLd id="post-ld" data={[postLd, breadcrumbsLd]} />
      {/* Use md: prefix to handle flex layout for medium screens and above */}
      <div className="block md:flex md:gap-8">
        {/* Article content area */}
        <article className="w-full md:flex-1 max-w-4xl">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
              {post.frontmatter.title}
            </h1>
            <div className="flex flex-wrap items-center text-muted-foreground gap-2 sm:gap-4">
              <time className="text-sm">
                {new Date(post.frontmatter.date).toLocaleDateString(params.lang, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <span className="hidden sm:inline">·</span>
              <span className="text-sm">
                {messages.text.blog.by} <span className="font-bold">{post.frontmatter.author}</span>
              </span>
            </div>
          </header>

          <div className="prose prose-sm sm:prose lg:prose-lg max-w-none">
            <MDXRemote
              source={post.content}
              components={{
                ...mdxComponents,
                wrapper: ({ children }) => (
                  <div className="space-y-4 text-foreground overflow-x-auto">
                    {children}
                  </div>
                ),
              }}
              options={mdxOptions}
            />
          </div>
        </article>
        <TableOfContents content={post.content} title={messages.text.blog.toc_title} />
      </div>
    </div>
  );
}
