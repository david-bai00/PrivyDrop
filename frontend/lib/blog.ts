// Blog utility functions
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const POSTS_PATH = path.join(process.cwd(), "content/blog");

export interface BlogPost {
  slug: string;
  frontmatter: {
    title: string;
    description: string;
    date: string;
    author: string;
    cover: string;
    tags: string[]; // Use the tags array directly
    status: string;
  };
  content: string;
}

export async function getAllPosts(lang: string): Promise<BlogPost[]> {
  const files = fs.readdirSync(POSTS_PATH);

  const postsWithLang = files
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => {
      const langFromFile = file.match(/-([a-z]{2})\.mdx?$/)?.[1];
      return { file, langFromFile };
    });

  const lang_dst = lang === "zh" ? "zh" : "en";
  const filteredFiles = postsWithLang.filter(
    ({ langFromFile }) => langFromFile === lang_dst
  );

  const posts = await Promise.all(
    filteredFiles.map(async ({ file }) => {
      const filePath = path.join(POSTS_PATH, file);
      const source = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(source);

      // Validate and transform frontmatter data
      const frontmatter = {
        title: data.title ?? "",
        description: data.description ?? "",
        date: data.date ?? new Date().toISOString(),
        author: data.author ?? "",
        cover: data.cover ?? "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        status: data.status ?? "draft",
      };

      return {
        slug: file.replace(/-[a-z]{2}\.mdx?$/, "").replace(/\.mdx?$/, ""),
        frontmatter,
        content,
      } as BlogPost;
    })
  );

  return posts
    .filter((post) => post.frontmatter.status === "published")
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime()
    );
}

export async function getPostBySlug(
  slug: string,
  lang: string
): Promise<BlogPost | null> {
  try {
    const lang_dst = lang === "zh" ? "zh" : "en";
    const filePath = path.join(POSTS_PATH, `${slug}-${lang_dst}.mdx`);
    const source = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(source);

    // Validate and transform frontmatter data
    const frontmatter = {
      title: data.title ?? "",
      description: data.description ?? "",
      date: data.date ?? new Date().toISOString(),
      author: data.author ?? "",
      cover: data.cover ?? "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      status: data.status ?? "draft",
    };

    return {
      slug,
      frontmatter,
      content,
    };
  } catch (error) {
    return null;
  }
}
// Get blog posts by tag
export async function getPostsByTag(
  tag: string,
  lang: string
): Promise<BlogPost[]> {
  const allPosts = await getAllPosts(lang);
  return allPosts.filter((post) => post.frontmatter.tags.includes(tag));
}
