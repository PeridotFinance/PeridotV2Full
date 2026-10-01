import { NextRequest, NextResponse } from 'next/server'
import { uploadBufferToFirebase } from '@/lib/firebase-storage'
import { assertProtectedBlogWrite } from '../_lib/security'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'article'
}

function normalizeContentType(value: string | null | undefined) {
  return (value || '').split(';')[0].trim().toLowerCase()
}

async function storeImage(buffer: Buffer, slug: string, contentType: string) {
  const extension = EXTENSION_BY_TYPE[contentType] || 'png'
  // Cache-busted filename: R2 objects are served with immutable caching, so a
  // re-upload under the same name would keep showing the old picture.
  const destinationPath = `blog/${slug}/title-${Date.now()}.${extension}`
  return uploadBufferToFirebase(buffer, destinationPath, contentType)
}

/**
 * Fetch a pasted image URL server-side and re-host it on R2.
 *
 * Two reasons this exists instead of storing the pasted URL directly:
 * next/image only renders hosts listed in `next.config.js` remotePatterns, and
 * a link the editor copied from a social post is usually an HTML page, not an
 * image — which silently renders as a broken cover.
 */
async function importFromUrl(sourceUrl: string, slug: string) {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    return { error: 'That is not a valid URL.' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Image URLs must start with http:// or https://.' }
  }

  let response: Response
  try {
    response = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    return { error: `Could not download that URL: ${error instanceof Error ? error.message : 'unknown error'}` }
  }

  if (!response.ok) {
    return { error: `The URL answered with HTTP ${response.status}.` }
  }

  const contentType = normalizeContentType(response.headers.get('content-type'))
  if (!EXTENSION_BY_TYPE[contentType]) {
    return {
      error:
        `That link is not a direct image (server sent "${contentType || 'no content type'}"). ` +
        'Open the picture itself and copy its image address — a link to a post or gallery page will not work.',
    }
  }

  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength === 0) {
    return { error: 'The downloaded image was empty.' }
  }
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return { error: 'That image is larger than 8 MB.' }
  }

  const url = await storeImage(Buffer.from(arrayBuffer), slug, contentType)
  return { url }
}

export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  try {
    const requestType = normalizeContentType(request.headers.get('content-type'))

    // JSON body → import an existing image URL onto our own CDN.
    if (requestType === 'application/json') {
      const body = await request.json().catch(() => null)
      const sourceUrl = typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : ''
      if (!sourceUrl) {
        return NextResponse.json({ error: 'No image URL provided.' }, { status: 400 })
      }
      const slug = sanitizeSlug((typeof body?.slug === 'string' ? body.slug : '') || 'article')
      const result = await importFromUrl(sourceUrl, slug)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, url: result.url })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const contentType = normalizeContentType(file.type)
    if (!EXTENSION_BY_TYPE[contentType]) {
      return NextResponse.json(
        { error: 'Unsupported image type. Please upload JPG, PNG, WEBP, GIF, AVIF or SVG.' },
        { status: 400 },
      )
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image is too large. Maximum allowed size is 8 MB.' }, { status: 400 })
    }

    const slug = sanitizeSlug((formData.get('slug') as string | null) ?? 'article')
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await storeImage(buffer, slug, contentType)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
