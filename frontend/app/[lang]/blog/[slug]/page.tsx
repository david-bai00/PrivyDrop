//Article detail page
import { MDXRemote } from "next-mdx-remote/rsc";
import { getPostBySlug } from "@/lib/blog";
import * as React from "react";
import { mdxOptions } from "@/lib/mdx-config";
import { mdxComponents } from "@/components/blog/MDXComponents";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { generateMetadata } from "./metadata";

export { generateMetadata };

export default async function BlogPost({
  params,
}: {
  params: { slug: string; lang: string };
}) {
  const post = await getPostBySlug(params.slug, params.lang);

  if (!post) {
    return <div>Post not found</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Use md: prefix to handle flex layout for medium screens and above */}
      <div className="block md:flex md:gap-8">
        {/* Article content area */}
        <article className="w-full md:flex-1 max-w-4xl">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">
              {post.frontmatter.title}
            </h1>
            <div className="flex flex-wrap items-center text-gray-600 gap-2 sm:gap-4">
              <time className="text-sm">
                {new Date(post.frontmatter.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <span className="hidden sm:inline">·</span>
              <span className="text-sm">
                by <span className="font-bold">{post.frontmatter.author}</span>
              </span>
            </div>
          </header>

          <div className="prose prose-sm sm:prose lg:prose-lg max-w-none">
            <MDXRemote
              source={post.content}
              components={{
                ...mdxComponents,
                wrapper: ({ children }) => (
                  <div className="space-y-4 text-gray-700 overflow-x-auto">
                    {children}
                  </div>
                ),
              }}
              options={mdxOptions}
            />
          </div>
        </article>
        <TableOfContents content={post.content} />
      </div>
    </div>
  );
}
