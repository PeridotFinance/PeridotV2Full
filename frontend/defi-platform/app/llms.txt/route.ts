import { buildLlmsTxt, PLAIN_TEXT_HEADERS } from "@/lib/docs/llms"

export const dynamic = "force-static"

export function GET() {
  return new Response(buildLlmsTxt(), { headers: PLAIN_TEXT_HEADERS })
}
