import { Metadata } from 'next'
import { getPostsByTag } from '@/lib/blog'
import { ArticleListItem } from '@/components/blog/ArticleListItem'
import { supportedLocales } from '@/constants/i18n-config';
import { unslugifyTag } from '@/utils/tagUtils'

export async function generateMetadata({
  params: { tag, lang }
}: {
  params: { tag: string; lang: string }
}): Promise<Metadata> {
  const decodedTag = unslugifyTag(tag);
  
  return {
    title: `${decodedTag} - SecureShare Blog Articles`,
    description: `Explore articles about ${decodedTag} - Learn about secure file sharing, private collaboration, and data privacy solutions related to ${decodedTag}`,
    keywords: `${decodedTag}, secure file sharing, p2p file transfer, privacy, collaboration, webrtc`,
    metadataBase: new URL('https://www.securityshare.xyz'),
    alternates: {
      canonical: `/${lang}/blog/tag/${encodeURIComponent(tag)}`,
      languages: {
        en: `/en/blog/tag/${encodeURIComponent(tag)}`,
        zh: `/zh/blog/tag/${encodeURIComponent(tag)}`,
      }
    },
    openGraph: {
      title: `${decodedTag} - SecureShare Blog Articles`,
      description: `Discover articles about ${decodedTag} - Expert insights on secure file sharing and private collaboration solutions`,
      url: `https://www.securityshare.xyz/${lang}/blog/tag/${encodeURIComponent(tag)}`,
      siteName: 'SecureShare',
      locale: lang,
      type: 'website',
    },
  }
}
export default async function TagPage({
  params: { tag, lang }
}: {
  params: { tag: string; lang: string }
}) {
  const decodedTag = unslugifyTag(tag);
  const posts = await getPostsByTag(decodedTag,lang)

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Main Content */}
        <main className="lg:col-span-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-4">Tag: {decodedTag}</h1>
            <p className="text-gray-600 text-lg">Articles tagged with {decodedTag}</p>
          </div>

          {/* Articles List */}
          <div className="space-y-12">
            {posts.length > 0 ? (
              posts.map((post) => (
                <ArticleListItem key={post.slug} post={post} />
              ))
            ) : (
              <p>No articles found for this decodedTag.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}