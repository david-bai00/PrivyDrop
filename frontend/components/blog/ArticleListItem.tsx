import Link from 'next/link'
import Image from 'next/image'
import { type BlogPost } from '@/lib/blog'

interface ArticleListItemProps {
  post: BlogPost
}

export function ArticleListItem({ post }: ArticleListItemProps) {
  return (
    <article className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
      <div className="relative h-80 w-full">
        <Image
          src={post.frontmatter.cover}
          alt={post.frontmatter.title}
          fill
          className="object-cover transition-transform duration-300 hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority
        />
      </div>
      
      <div className="p-8">
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <time className="font-medium">
            {new Date(post.frontmatter.date).toLocaleDateString()}
          </time>
          <span>·</span>
          <div className="flex gap-2 flex-wrap">
            {post.frontmatter.tags.map((tag) => (
              <span 
                key={tag} 
                className="bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Link href={`/blog/${post.slug}`}>
          <h2 className="text-3xl font-bold mb-4 hover:text-blue-600 transition-colors leading-tight">
            {post.frontmatter.title}
          </h2>
        </Link>
        
        <p className="text-gray-600 mb-6 text-lg leading-relaxed line-clamp-3">
          {post.frontmatter.description}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <Link 
            href={`/blog/${post.slug}`}
            className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center text-lg"
          >
            Read more 
            <svg className="w-5 h-5 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="text-sm">by <span className="font-bold">{post.frontmatter.author}</span></span>
          </div>
        </div>
      </div>
    </article>
  )
}