import { getAllPosts } from "@/lib/blog";
import { ArticleListItem } from "@/components/blog/ArticleListItem";
import Link from "next/link";
import { slugifyTag } from "@/utils/tagUtils";
import { generateMetadata } from "./metadata";
import { getDictionary } from "@/lib/dictionary";

export { generateMetadata };

export default async function BlogPage({
  params: { lang },
}: {
  params: { lang: string };
}) {
  const posts = await getAllPosts(lang);
  const messages = await getDictionary(lang);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Main Content */}
        <main className="lg:col-span-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-4">{messages.text.blog.list_title}</h1>
            <p className="text-gray-600 text-lg">{messages.text.blog.list_subtitle}</p>
          </div>

          {/* Articles List */}
          <div className="space-y-12">
            {posts.map((post) => (
              <ArticleListItem key={post.slug} post={post} lang={lang} messages={messages} />
            ))}
          </div>
        </main>

        {/* Sidebar */}
        <aside className="lg:col-span-4">
          <div className="sticky top-8">
            {/* Recent Posts */}
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <h2 className="text-xl font-bold mb-6">{messages.text.blog.recent_posts}</h2>
              <div className="space-y-4">
                {posts.slice(0, 5).map((post) => (
                  <Link
                    key={post.slug}
                    href={`/${lang}/blog/${post.slug}`}
                    className="block hover:text-blue-600 text-base font-medium"
                  >
                    {post.frontmatter.title}
                  </Link>
                ))}
              </div>
            </div>
            {/* tags */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-xl font-bold mb-6">{messages.text.blog.tags}</h2>
              <div className="space-y-3">
                {/* Get all tags and deduplicate */}
                {Array.from(
                  new Set(posts.flatMap((p) => p.frontmatter.tags))
                ).map((tag) => (
                  <Link
                    key={tag}
                    href={`/${lang}/blog/tag/${slugifyTag(tag)}`} // Jump to the tag filtering page
                    className="flex items-center justify-between hover:text-blue-600"
                  >
                    <span className="text-gray-700 font-medium">{tag}</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm text-gray-600">
                      {
                        posts.filter((p) => p.frontmatter.tags.includes(tag))
                          .length
                      }
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
