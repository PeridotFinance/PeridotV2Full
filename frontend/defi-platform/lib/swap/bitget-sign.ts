import crypto from 'crypto'

const API_KEY = process.env.BITGET_API_KEY ?? ''
const API_SECRET = process.env.BITGET_API_SECRET ?? ''

/**
 * Generate Bitget API signature headers.
 * Signs a JSON object with HMAC-SHA256 + Base64.
 * Keys are sorted alphabetically as required by the API.
 */
export function bitgetHeaders(
  apiPath: string,
  body: Record<string, any> | null,
  queryParams?: Record<string, string>,
): Record<string, string> {
  const timestamp = String(Date.now())

  // Build content object with alphabetically sorted keys
  const content: Record<string, string> = {}
  content['apiPath'] = apiPath
  if (body) {
    content['body'] = JSON.stringify(body)
  }
  // Add query params as individual fields
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      content[k] = v
    }
  }
  content['x-api-key'] = API_KEY
  content['x-api-timestamp'] = timestamp

  // Sort keys alphabetically and build JSON string
  const sorted = Object.keys(content).sort()
  const sortedObj: Record<string, string> = {}
  for (const key of sorted) {
    sortedObj[key] = content[key]
  }
  const contentStr = JSON.stringify(sortedObj)

  // HMAC-SHA256 → Base64
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(contentStr)
    .digest('base64')

  return {
    'Content-Type': 'application/json',
    'Partner-Code': process.env.BITGET_PARTNER_CODE ?? 'Peridot',
    'x-api-key': API_KEY,
    'x-api-timestamp': timestamp,
    'x-api-signature': signature,
  }
}
