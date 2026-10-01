import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { assertProtectedBlogWrite } from '../_lib/security'

/**
 * POST /api/blog/save-checkpoint
 *
 * Persists (or clears) a generation checkpoint for a blog post draft.
 * Called fire-and-forget from the client after each SSE step completes,
 * so that a failed generation can be resumed from the last good step.
 *
 * Body:
 *   { slug: string, checkpoint: object }   — upsert checkpoint
 *   { slug: string, clear: true }          — clear checkpoint (generation done)
 */
export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { slug, checkpoint, clear } = body

    if (!slug || typeof slug !== 'string' || slug.length > 200) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    if (clear === true) {
      await sql`
        UPDATE blog_posts
        SET generation_checkpoint = NULL,
            updated_at = NOW()
        WHERE slug = ${slug}
      `
      return NextResponse.json({ ok: true })
    }

    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
      return NextResponse.json({ error: 'checkpoint object is required' }, { status: 400 })
    }

    // Extract the minimal required INSERT fields from checkpoint data.
    // The article may not exist yet (first checkpoint is saved after step 2).
    const baseInfo = checkpoint?.partialData?.['base-info']?.baseInfo
    const title: string = (baseInfo?.title) || slug
    const excerpt: string = (baseInfo?.excerpt) || ''

    await sql`
      INSERT INTO blog_posts (
        slug, status, title, excerpt, content_md, generation_checkpoint
      ) VALUES (
        ${slug}, 'draft', ${title}, ${excerpt}, '', ${checkpoint}
      )
      ON CONFLICT (slug) DO UPDATE SET
        generation_checkpoint = EXCLUDED.generation_checkpoint,
        updated_at = NOW()
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[save-checkpoint] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save checkpoint' },
      { status: 500 }
    )
  }
}
