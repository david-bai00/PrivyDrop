import { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { getPostsByTag } from "@/lib/blog";
import { ArticleListItem } from "@/components/blog/ArticleListItem";
import { supportedLocales, type Locale } from "@/constants/i18n-config";
import { unslugifyTag } from "@/utils/tagUtils";
import type { Messages } from "@/types/messages";

export async function generateMetadata({
  params: { tag, lang },
}: {
  params: { tag: string; lang: string };
}): Promise<Metadata> {
  const locale = lang as Locale;
  const decodedTag = unslugifyTag(tag);
  const messages = (await getMessages({ locale })) as Messages;

  // Note: metadata text kept concise and localized
  return {
    title: `${messages.text.blog.tagTitlePrefix}: ${decodedTag} - PrivyDrop`,
    description: messages.text.blog.tagSubtitleTemplate.replace("{tag}", decodedTag),
    keywords: `${decodedTag}, blog, privydrop`,
    metadataBase: new URL("https://www.privydrop.app"),
    alternates: {
      canonical: `/${locale}/blog/tag/${encodeURIComponent(tag)}`,
      languages: Object.fromEntries(
        supportedLocales.map((l) => [l, `/${l}/blog/tag/${encodeURIComponent(tag)}`])
      ),
    },
    openGraph: {
      title: `${decodedTag} - PrivyDrop`,
      description: `Articles tagged: ${decodedTag}`,
      url: `https://www.privydrop.app/${locale}/blog/tag/${encodeURIComponent(tag)}`,
      siteName: "PrivyDrop",
      locale,
      type: "website",
    },
  };
}
export default async function TagPage({
  params: { tag, lang },
}: {
  params: { tag: string; lang: string };
}) {
  const locale = lang as Locale;
  const decodedTag = unslugifyTag(tag);
  const posts = await getPostsByTag(decodedTag, locale);
  const messages = (await getMessages({ locale })) as Messages;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Main Content */}
        <main className="lg:col-span-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-4">{messages.text.blog.tagTitlePrefix}: {decodedTag}</h1>
            <p className="text-muted-foreground text-lg">
              {messages.text.blog.tagSubtitleTemplate.replace("{tag}", decodedTag)}
            </p>
          </div>

          {/* Articles List */}
            <div className="space-y-12">
              {posts.length > 0 ? (
                posts.map((post) => (
                  <ArticleListItem key={post.slug} post={post} />
                ))
              ) : (
                <p>{messages.text.blog.tagEmpty}</p>
              )}
            </div>
        </main>
      </div>
    </div>
  );
}
