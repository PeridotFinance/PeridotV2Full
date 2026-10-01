import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// GET /api/blog - blogroll (published posts)
export async function GET(request: NextRequest) {
  try {
    const posts = await sql`
      SELECT 
        slug,
        title,
        excerpt,
        cover_image_url as coverImageUrl,
        category,
        tags,
        author_name as authorName,
        author_picture_url as authorPictureUrl,
        published_at as publishedAt,
        reading_time_minutes as readingTimeMinutes
      FROM blog_posts
      WHERE status = 'published'
        AND insights_data IS NULL
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 100
    `

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Error fetching blogroll:', error)
    return NextResponse.json({ error: 'Failed to fetch blog posts' }, { status: 500 })
  }
}


