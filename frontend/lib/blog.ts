//博客工具函数
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const POSTS_PATH = path.join(process.cwd(), 'content/blog')

export interface BlogPost {
  slug: string
  frontmatter: {
    title: string
    description: string
    date: string
    author: string
    cover: string
    tags: string[] // 直接使用 tags 数组
    status: string
  }
  content: string
}

export async function getAllPosts(lang: string): Promise<BlogPost[]> {
  const files = fs.readdirSync(POSTS_PATH)
  
  const posts = await Promise.all(
    files
      .filter((file) => /\.mdx?$/.test(file))
      .map(async (file) => {
        const filePath = path.join(POSTS_PATH, file)
        const source = fs.readFileSync(filePath, 'utf8')
        const { data, content } = matter(source)
        
        // 验证和转换 frontmatter 数据
        const frontmatter = {
          title: data.title ?? '',
          description: data.description ?? '',
          date: data.date ?? new Date().toISOString(),
          author: data.author ?? '',
          cover: data.cover ?? '',
          tags: Array.isArray(data.tags) ? data.tags : [], // 直接使用 tags 数组
          status: data.status ?? 'draft'
        }
        
        return {
          slug: file.replace(/\.mdx?$/, ''),
          frontmatter,
          content
        } as BlogPost
      })
  )
  
    // 过滤掉 draft 状态的博客
    return posts
      .filter(post => post.frontmatter.status === 'published') // 仅保留 published 状态
      .filter(post => {
        // 将 slug 按 '-' 分割成数组
        const parts = post.slug.split('-');
        // 获取最后一部分
        const lastPart = parts[parts.length - 1];
        // 判断最后一部分是否等于目标语言 && 目标语言如果是中文则返回中文博客否则返回英文
        const lang_dst = lang === 'zh' ? 'zh':'en';
        return lastPart === lang_dst;
      })
      .sort((a, b) => 
    new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime()
  )
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const filePath = path.join(POSTS_PATH, `${slug}.mdx`)
    const source = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(source)
    
    // 验证和转换 frontmatter 数据
    const frontmatter = {
      title: data.title ?? '',
      description: data.description ?? '',
      date: data.date ?? new Date().toISOString(),
      author: data.author ?? '',
      cover: data.cover ?? '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      status: data.status ?? 'draft'
    }
    
    return {
      slug,
      frontmatter,
      content
    }
  } catch (error) {
    return null
  }
}
// 根据标签获取博客文章
export async function getPostsByTag(tag: string,lang: string): Promise<BlogPost[]> {
  const allPosts = await getAllPosts(lang)
  return allPosts.filter(post => post.frontmatter.tags.includes(tag))
}