import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { ImageResponse } from 'next/og'
import { uploadCoverImage } from '@/lib/firebase-storage'
import { revalidatePath } from 'next/cache'

// Helper functions for word count and reading time
function computeWordCount(md: string): number {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ') // strip code blocks
    .replace(/`[^`]*`/g, ' ') // strip inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ') // strip images
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ') // strip links
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 0
  return text.split(' ').length
}

function computeReadingTimeMinutes(wordCount: number, wordsPerMinute: number = 200): number {
  if (!wordCount) return 0
  return Math.max(1, Math.round(wordCount / wordsPerMinute))
}

/**
 * Generate a cover image with green background and white title text
 */
async function generateCoverImage(title: string): Promise<Buffer> {
  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Green gradient
          padding: '80px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            maxWidth: '1000px',
          }}
        >
          <h1
            style={{
              fontSize: '72px',
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.2,
              margin: 0,
              textAlign: 'center',
              wordWrap: 'break-word',
            }}
          >
            {title}
          </h1>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )

  const arrayBuffer = await imageResponse.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// POST /api/blog/create - create a new article
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // DoS Protection: Validate field lengths
    if (body.content && body.content.length > 500000) {
      return NextResponse.json({ error: 'Content too long (max 500KB)' }, { status: 400 })
    }
    if (body.title && body.title.length > 500) {
      return NextResponse.json({ error: 'Title too long' }, { status: 400 })
    }
    if (body.excerpt && body.excerpt.length > 2000) {
      return NextResponse.json({ error: 'Excerpt too long' }, { status: 400 })
    }
    if (body.slug && body.slug.length > 200) {
      return NextResponse.json({ error: 'Slug too long' }, { status: 400 })
    }

    // Validate required fields
    if (!body.title || !body.slug || !body.excerpt || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: title, slug, excerpt, content' },
        { status: 400 }
      )
    }

    // Compute word count and reading time
    const wordCount = computeWordCount(body.content)
    const readingTimeMinutes = computeReadingTimeMinutes(wordCount)

    // Handle published_at based on status
    let publishedAt: string | null = null
    if (body.status === 'published') {
      publishedAt = new Date().toISOString()
    }

    // Prepare FAQ JSON - postgres.js handles JSON/JSONB automatically when passing objects/arrays
    const faqJson = body.faq && Array.isArray(body.faq) && body.faq.length > 0
      ? body.faq
      : null

    // Ensure tags and metaKeywords are arrays (never null/undefined)
    // Empty arrays should work, but ensure they're proper arrays
    const tags: string[] = Array.isArray(body.tags) 
      ? body.tags.filter((t: any) => t && typeof t === 'string' && t.trim())
      : []
    const metaKeywords: string[] = Array.isArray(body.metaKeywords)
      ? body.metaKeywords.filter((k: any) => k && typeof k === 'string' && k.trim())
      : []
    
    // Debug: log the arrays to see what we're sending
    console.log('Tags array:', tags, 'Type:', Array.isArray(tags))
    console.log('MetaKeywords array:', metaKeywords, 'Type:', Array.isArray(metaKeywords))

    // Generate and upload cover image if not provided
    let coverImageUrl = body.coverImageUrl || '/blog/article-title.webp'
    let ogImageUrl = body.ogImageUrl || coverImageUrl

    try {
      // Only generate if no cover image was provided
      if (!body.coverImageUrl) {
        const imageBuffer = await generateCoverImage(body.title)
        coverImageUrl = await uploadCoverImage(imageBuffer, body.slug)
        ogImageUrl = coverImageUrl
      } else if (!body.ogImageUrl) {
        ogImageUrl = coverImageUrl
      }
    } catch (error) {
      console.error('Error generating/uploading cover image:', error)
      // Continue with default placeholder if image generation fails
      // Don't fail the entire request
    }

    // Prepare Insights JSON
    const insightsDataJson = body.insightsData ? body.insightsData : null

    // Insert into database
    // Use sql.unsafe for the ON CONFLICT clause to handle array casting properly
    const result = await sql`
      INSERT INTO blog_posts (
        slug, status, published_at, title, excerpt, content_md,
        word_count, reading_time_minutes,
        author_name, author_url, author_picture_url,
        author_bio, author_links_x, author_links_linkedin, author_links_website,
        category, tags,
        cover_image_url, og_image_url,
        meta_title, meta_description, meta_keywords, canonical_url, meta_robots,
        faq, insights_data
      ) VALUES (
        ${body.slug}, 
        ${body.status || 'draft'}, 
        ${publishedAt},
        ${body.title}, 
        ${body.excerpt}, 
        ${body.content},
        ${wordCount}, 
        ${readingTimeMinutes},
        ${body.authorName || 'Placeholder Author'}, 
        ${body.authorUrl || null}, 
        ${body.authorPictureUrl || null},
        ${body.authorBio || null}, 
        ${body.authorLinksX || null}, 
        ${body.authorLinksLinkedin || null}, 
        ${body.authorLinksWebsite || null},
        ${body.category || null}, 
        ${sql.array(tags)},
        ${coverImageUrl}, 
        ${ogImageUrl},
        ${body.metaTitle || body.title}, 
        ${body.metaDescription || body.excerpt}, 
        ${sql.array(metaKeywords)}, 
        ${body.canonicalUrl || null}, 
        ${body.metaRobots || 'index,follow'},
        ${faqJson},
        ${insightsDataJson}
      )
      ON CONFLICT (slug) DO UPDATE SET
        status = EXCLUDED.status,
        published_at = CASE 
          WHEN EXCLUDED.status = 'published' THEN COALESCE(blog_posts.published_at, EXCLUDED.published_at, NOW())
          ELSE NULL 
        END,
        title = EXCLUDED.title,
        excerpt = EXCLUDED.excerpt,
        content_md = EXCLUDED.content_md,
        word_count = EXCLUDED.word_count,
        reading_time_minutes = EXCLUDED.reading_time_minutes,
        author_name = EXCLUDED.author_name,
        author_url = EXCLUDED.author_url,
        author_picture_url = COALESCE(EXCLUDED.author_picture_url, blog_posts.author_picture_url),
        author_bio = EXCLUDED.author_bio,
        author_links_x = EXCLUDED.author_links_x,
        author_links_linkedin = EXCLUDED.author_links_linkedin,
        author_links_website = EXCLUDED.author_links_website,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        cover_image_url = EXCLUDED.cover_image_url,
        og_image_url = COALESCE(EXCLUDED.og_image_url, EXCLUDED.cover_image_url),
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        meta_keywords = EXCLUDED.meta_keywords,
        canonical_url = EXCLUDED.canonical_url,
        meta_robots = EXCLUDED.meta_robots,
        faq = EXCLUDED.faq,
        insights_data = EXCLUDED.insights_data,
        updated_at = NOW()
      RETURNING id, slug, title, status
    `

    const article = result[0]

    // Save version
    if (article?.id) {
      await sql`
        INSERT INTO blog_post_versions (
          blog_post_id, slug, status, title, excerpt, content_md, insights_data,
          author_name, author_url, author_picture_url,
          author_bio, author_links_x, author_links_linkedin, author_links_website,
          category, tags, cover_image_url, og_image_url,
          meta_title, meta_description, meta_keywords, canonical_url, meta_robots,
          faq
        ) VALUES (
          ${article.id}, ${body.slug}, ${body.status || 'draft'}, ${body.title}, ${body.excerpt}, ${body.content}, ${insightsDataJson},
          ${body.authorName || 'Placeholder Author'}, ${body.authorUrl || null}, ${body.authorPictureUrl || null},
          ${body.authorBio || null}, ${body.authorLinksX || null}, ${body.authorLinksLinkedin || null}, ${body.authorLinksWebsite || null},
          ${body.category || null}, ${sql.array(tags)}, ${coverImageUrl}, ${ogImageUrl},
          ${body.metaTitle || body.title}, ${body.metaDescription || body.excerpt}, ${sql.array(metaKeywords)}, ${body.canonicalUrl || null}, ${body.metaRobots || 'index,follow'},
          ${faqJson}
        )
      `
    }
    
    // Clear caches
    try {
      revalidatePath('/blog', 'page')
      revalidatePath('/blog', 'layout')
      revalidatePath(`/blog/${article.slug}`, 'page')
      revalidatePath(`/blog/${article.slug}`, 'layout')
      revalidatePath('/', 'page')
      revalidatePath('/insights', 'page')
    } catch (cacheError) {
      console.error('Error revalidating paths:', cacheError)
    }
    
    return NextResponse.json({
      success: true,
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        status: article.status,
        wordCount,
        readingTimeMinutes
      }
    })
  } catch (error) {
    console.error('Error creating article:', error)
    return NextResponse.json(
      { error: 'Failed to create article', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

