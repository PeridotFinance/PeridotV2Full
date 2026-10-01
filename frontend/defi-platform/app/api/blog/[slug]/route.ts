import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// GET /api/blog/[slug] - single article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  try {
    const rows = await sql`
      SELECT 
        slug,
        status,
        title,
        excerpt,
        content_md as "contentMd",
        word_count as "wordCount",
        reading_time_minutes as "readingTimeMinutes",
        author_name as "authorName",
        author_url as "authorUrl",
        author_picture_url as "authorPictureUrl",
        author_bio as "authorBio",
        author_links_x as "authorLinksX",
        author_links_linkedin as "authorLinksLinkedin",
        author_links_website as "authorLinksWebsite",
        faq,
        category,
        tags,
        cover_image_url as "coverImageUrl",
        og_image_url as "ogImageUrl",
        meta_title as "metaTitle",
        meta_description as "metaDescription",
        meta_keywords as "metaKeywords",
        canonical_url as "canonicalUrl",
        meta_robots as "metaRobots",
        insights_data as "insightsData",
        published_at as "publishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM blog_posts
      WHERE slug = ${slug}
      LIMIT 1
    `

    const post = rows?.[0]
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Default author name if missing
    if (!post.authorName) post.authorName = 'Peridot.Finance'

    return NextResponse.json({ post })
  } catch (error) {
    console.error('Error fetching post by slug:', error)
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 })
  }
}


