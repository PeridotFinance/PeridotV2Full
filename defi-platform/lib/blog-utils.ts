import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeFormat from "rehype-format"
import rehypeStringify from "rehype-stringify"
import type { Post } from "@/types/blog"

const postsDirectory = path.join(process.cwd(), "blog-posts")

export function getPostSlugs() {
  return fs.readdirSync(postsDirectory).map((filename) => filename.replace(/\.md$/, ""))
}

export function getPostBySlug(slug: string): Post {
  const fullPath = path.join(postsDirectory, `${slug}.md`)
  const fileContents = fs.readFileSync(fullPath, "utf8")
  const { data, content } = matter(fileContents)

  return {
    slug,
    title: data.title,
    excerpt: data.excerpt,
    coverImage: data.coverImage,
    date: data.date,
    author: {
      name: data.author.name,
      picture: data.author.picture,
    },
    category: data.category,
    tags: data.tags || [],
    content,
  }
}

export function getAllPosts(): Post[] {
  const slugs = getPostSlugs()
  const posts = slugs.map((slug) => getPostBySlug(slug))

  // Sort posts by date in descending order
  return posts.sort((a, b) => (a.date > b.date ? -1 : 1))
}

export async function markdownToHtml(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings)
    .use(rehypeFormat)
    .use(rehypeStringify)
    .process(markdown)

  return result.toString()
}

export function getTableOfContents(content: string) {
  const headingLines = content.split("\n").filter((line) => line.match(/^#{2,3} /))

  return headingLines.map((heading) => {
    const level = heading.match(/^#{2,3} /)[0].trim().length
    const title = heading.replace(/^#{2,3} /, "")
    const slug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")

    return {
      level,
      title,
      slug,
    }
  })
}
