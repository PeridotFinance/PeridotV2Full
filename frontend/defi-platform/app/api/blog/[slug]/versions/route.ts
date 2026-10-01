import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// GET /api/blog/[slug]/versions - fetch all versions of an article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  
  try {
    const rows = await sql`
      SELECT 
        v.id,
        v.slug,
        v.status,
        v.title,
        v.excerpt,
        v.content_md as "contentMd",
        v.insights_data as "insightsData",
        v.author_name as "authorName",
        v.author_url as "authorUrl",
        v.author_picture_url as "authorPictureUrl",
        v.author_bio as "authorBio",
        v.author_links_x as "authorLinksX",
        v.author_links_linkedin as "authorLinksLinkedin",
        v.author_links_website as "authorLinksWebsite",
        v.faq,
        v.category,
        v.tags,
        v.cover_image_url as "coverImageUrl",
        v.og_image_url as "ogImageUrl",
        v.meta_title as "metaTitle",
        v.meta_description as "metaDescription",
        v.meta_keywords as "metaKeywords",
        v.canonical_url as "canonicalUrl",
        v.meta_robots as "metaRobots",
        v.created_at as "createdAt"
      FROM blog_post_versions v
      JOIN blog_posts p ON v.blog_post_id = p.id
      WHERE p.slug = ${slug}
      ORDER BY v.created_at DESC
    `

    return NextResponse.json({ versions: rows })
  } catch (error) {
    console.error('Error fetching post versions:', error)
    return NextResponse.json({ error: 'Failed to fetch article versions' }, { status: 500 })
  }
}
