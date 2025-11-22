import { Metadata } from "next";
import { getPostsByTag } from "@/lib/blog";
import { ArticleListItem } from "@/components/blog/ArticleListItem";
import { supportedLocales } from "@/constants/i18n-config";
import { unslugifyTag } from "@/utils/tagUtils";
import { getDictionary } from "@/lib/dictionary";

export async function generateMetadata({
  params: { tag, lang },
}: {
  params: { tag: string; lang: string };
}): Promise<Metadata> {
  const decodedTag = unslugifyTag(tag);
  const messages = await getDictionary(lang);

  // Note: metadata text kept concise and localized
  return {
    title: `${messages.text.blog.tag_title_prefix}: ${decodedTag} - PrivyDrop`,
    description: messages.text.blog.tag_subtitle_template.replace("{tag}", decodedTag),
    keywords: `${decodedTag}, blog, privydrop`,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${lang}/blog/tag/${encodeURIComponent(tag)}`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog/tag/${encodeURIComponent(tag)}`])
      ),
    },
    openGraph: {
      title: `${decodedTag} - PrivyDrop`,
      description: `Articles tagged: ${decodedTag}`,
      url: `https://www.privydrop.app/${lang}/blog/tag/${encodeURIComponent(tag)}`,
      siteName: "PrivyDrop",
      locale: lang,
      type: "website",
    },
  };
}
export default async function TagPage({
  params: { tag, lang },
}: {
  params: { tag: string; lang: string };
}) {
  const decodedTag = unslugifyTag(tag);
  const posts = await getPostsByTag(decodedTag, lang);
  const messages = await getDictionary(lang);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Main Content */}
        <main className="lg:col-span-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-4">{messages.text.blog.tag_title_prefix}: {decodedTag}</h1>
            <p className="text-gray-600 text-lg">
              {messages.text.blog.tag_subtitle_template.replace("{tag}", decodedTag)}
            </p>
          </div>

          {/* Articles List */}
          <div className="space-y-12">
            {posts.length > 0 ? (
              posts.map((post) => (
                <ArticleListItem key={post.slug} post={post} lang={lang} messages={messages} />
              ))
            ) : (
              <p>{messages.text.blog.tag_empty}</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
