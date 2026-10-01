// The spec lets a subpath carry its own file, and /docs is the subtree an agent
// most often lands in. Same content as the root index; more specific wins.
import { buildLlmsTxt, PLAIN_TEXT_HEADERS } from "@/lib/docs/llms"

export const dynamic = "force-static"

export function GET() {
  return new Response(buildLlmsTxt(), { headers: PLAIN_TEXT_HEADERS })
}
