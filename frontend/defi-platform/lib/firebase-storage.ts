import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'peridot',
  publicBaseUrl:
    process.env.R2_PUBLIC_BASE_URL ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME || 'peridot'}`
      : undefined),
}

function ensureR2Configured() {
  const missing: string[] = []
  if (!R2_CONFIG.accountId) missing.push('R2_ACCOUNT_ID')
  if (!R2_CONFIG.accessKeyId) missing.push('R2_ACCESS_KEY_ID')
  if (!R2_CONFIG.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY')
  if (!R2_CONFIG.bucketName) missing.push('R2_BUCKET_NAME')
  if (!R2_CONFIG.publicBaseUrl) missing.push('R2_PUBLIC_BASE_URL (or set R2_ACCOUNT_ID so it can be derived)')

  if (missing.length) {
    throw new Error(
      `Cloudflare R2 configuration missing: ${missing.join(
        ', ',
      )}. Please set these values in .env.local using your R2 credentials.`,
    )
  }
}

let cachedClient: S3Client | null = null

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient
  ensureR2Configured()
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId!,
      secretAccessKey: R2_CONFIG.secretAccessKey!,
    },
  })
  return cachedClient
}

/**
 * Upload a buffer to Cloudflare R2 and return its public URL
 */
export async function uploadBufferToFirebase(
  buffer: Buffer,
  destinationPath: string,
  contentType: string = 'image/png'
): Promise<string> {
  try {
    const client = getR2Client()
    await client.send(
      new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName!,
        Key: destinationPath,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )

    const baseUrl = R2_CONFIG.publicBaseUrl!
    const normalizedBase = baseUrl.replace(/\/$/, '')
    const normalizedPath = destinationPath.replace(/^\/+/, '')
    return `${normalizedBase}/${normalizedPath}`
  } catch (error) {
    console.error('Error uploading to Cloudflare R2:', error)
    throw error
  }
}

/**
 * Upload a generated cover image to Firebase Storage
 */
export async function uploadCoverImage(
  imageBuffer: Buffer,
  slug: string
): Promise<string> {
  const destinationPath = `blog/${slug}/cover.jpg`
  return uploadBufferToFirebase(imageBuffer, destinationPath, 'image/jpeg')
}

/**
 * Upload a concept image for in-article use
 */
export async function uploadConceptImage(
  imageBuffer: Buffer,
  slug: string,
  imageIndex: number
): Promise<string> {
  const destinationPath = `blog/${slug}/concept-${imageIndex}.jpg`
  return uploadBufferToFirebase(imageBuffer, destinationPath, 'image/jpeg')
}

/**
 * Upload a meme submission to R2.
 * Returns { fullUrl, thumbUrl } — full-res PNG for download, JPEG thumb for gallery display.
 */
export async function uploadMemeImages(
  fullBuffer: Buffer,
  thumbBuffer: Buffer,
  hex: string,
): Promise<{ fullUrl: string; thumbUrl: string }> {
  const [fullUrl, thumbUrl] = await Promise.all([
    uploadBufferToFirebase(fullBuffer, `memes/${hex}.png`,       'image/png'),
    uploadBufferToFirebase(thumbBuffer, `memes/${hex}-thumb.jpg`, 'image/jpeg'),
  ])
  return { fullUrl, thumbUrl }
}

