import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeFormat from "rehype-format"
import rehypeStringify from "rehype-stringify"
import type { Post } from "@/types/blog"
import { sql } from "@/lib/database"

export function getPostSlugs() {
  // Fetch published slugs from DB
  // Note: keep published filter to match frontend expectations
  return []
}

export function getPostBySlug(slug: string): Post {
  throw new Error('getPostBySlug is now database-backed and should be called asynchronously via fetchPostBySlugAsync')
}

export function getAllPosts(): Post[] {
  // Provide empty to avoid build-time FS usage; use async functions below in server components
  return []
}

export async function markdownToHtml(markdown: string) {
  // Extract explanations before processing
  const explanations: Array<{ lineIndex: number; explanation: string }> = []
  const lines = markdown.split('\n')
  const processedLines: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/<!--\s*EXPLANATION:\s*(.+?)\s*-->/)
    if (match) {
      const explanationText = match[1].trim()
      const index = explanations.length
      explanations.push({
        lineIndex: processedLines.length,
        explanation: explanationText,
      })
      // Replace with actual HTML div that will be preserved by rehype-raw
      // Properly escape the explanation text to avoid HTML issues
      const escapedText = explanationText
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      processedLines.push(`<div data-explanation="${index}" data-explanation-text="${escapedText}"></div>`)
    } else {
      processedLines.push(line)
    }
  }
  
  const processedMarkdown = processedLines.join('\n')
  
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true }) // Allow raw HTML
    .use(rehypeRaw) // Parse raw HTML divs we inserted
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings)
    .use(rehypeFormat)
    .use(rehypeStringify, { allowDangerousHtml: true }) // Allow raw HTML in output
    .process(processedMarkdown)

  const html = result.toString()
  
  // Debug: Log if explanations were found
  if (explanations.length > 0) {
    console.log(`[markdownToHtml] Found ${explanations.length} explanation(s) to process`)
    // Check if HTML contains the explanation divs
    const explanationDivCount = (html.match(/data-explanation/g) || []).length
    console.log(`[markdownToHtml] Found ${explanationDivCount} explanation div(s) in HTML output`)
  }

  return { html, explanations }
}

export function getTableOfContents(content: string) {
  const headingLines = content.split("\n").filter((line) => line.match(/^#{2,3} /))

  return headingLines.map((heading) => {
    const level = heading.match(/^#{2,3} /)![0].trim().length
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

// New async helpers for DB-backed blog
export async function fetchAllPostsFromDB(): Promise<Post[]> {
  const rows = await sql`
    SELECT 
      slug,
      title,
      excerpt,
      cover_image_url,
      COALESCE(published_at, created_at) AS date,
      author_name,
      author_picture_url,
      category,
      tags
    FROM blog_posts
    WHERE status = 'published'
      AND insights_data IS NULL
    ORDER BY published_at DESC NULLS LAST, created_at DESC
  `
  return (rows as any[]).map((r) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImage: r.cover_image_url,
    date: r.date?.toISOString?.() || r.date,
    author: { name: r.author_name || 'Peridot.Finance', picture: r.author_picture_url || '' },
    category: r.category || '',
    tags: r.tags || [],
    content: ''
  }))
}

export async function fetchPostBySlugFromDB(slug: string): Promise<(Post & {
  authorBio?: string | null,
  authorUrl?: string | null,
  authorLinks?: { x?: string | null, linkedin?: string | null, website?: string | null },
  faq?: { question: string, answer: string }[] | null
}) | null> {
  const rows = await sql`
    SELECT 
      slug,
      title,
      excerpt,
      content_md,
      cover_image_url,
      COALESCE(published_at, created_at) AS date,
      author_name,
      author_url,
      author_picture_url,
      author_bio,
      author_links_x,
      author_links_linkedin,
      author_links_website,
      faq,
      category,
      tags
    FROM blog_posts
    WHERE slug = ${slug} AND status = 'published' AND insights_data IS NULL
    LIMIT 1
  `
  const r = (rows as any[])[0]
  if (!r) return null
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImage: r.cover_image_url,
    date: r.date?.toISOString?.() || r.date,
    author: { name: r.author_name || 'Peridot.Finance', picture: r.author_picture_url || '' },
    category: r.category || '',
    tags: r.tags || [],
    content: r.content_md || '',
    authorBio: r.author_bio || null,
    authorUrl: r.author_url || null,
    authorLinks: { x: r.author_links_x || null, linkedin: r.author_links_linkedin || null, website: r.author_links_website || null },
    faq: r.faq || null
  }
}
