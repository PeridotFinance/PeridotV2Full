/**
 * Cheap regex-based intent classifier for speculative prefetch.
 *
 * The chat route calls this on every incoming user message; when it returns
 * a non-null intent the route kicks off the matching reads in parallel with
 * LLM round 1. If the LLM then calls the corresponding tool, the data is
 * already cached and the executor returns in ~10 ms instead of 1-2 s.
 *
 * Design rules:
 *  - Favor precision over recall. A false positive wastes an RPC read (free)
 *    but a false negative costs the user 1-2 s of latency — so the patterns
 *    are conservative-but-loose. When in doubt, don't prefetch.
 *  - Case-insensitive, tolerant of filler words.
 *  - Cap input length: an 8 000-char paste is almost never a portfolio
 *    question; skip the regex cost on those.
 */

export type PrefetchIntent = 'portfolio' | 'markets' | null

// Catches the consumer phrasings the prompt-design work settled on:
//   "what are my positions?"   "show my portfolio"
//   "how much do I have?"      "my balances"
//   "what's in my wallet?"     "my holdings"
//   "summary"                  "overview"
// Intentionally NOT triggering on "deposit $X" / "supply" — those go to the
// snapshot path (hub+spokes pre-loaded into the system prompt) which is even
// faster than a prefetched tool call.
const PORTFOLIO_RE =
  /\b(positions?|portfolio|balances?|holdings?|wallet|summary|overview|earning|yielding)\b/i

// Markets intent — the user is asking about *available* pools / rates, not
// their own money. Phrasings we see:
//   "what are the best rates?"   "show me markets"
//   "compare pools"              "which pool has the highest APY"
//   "live rates"                 "best yield right now"
// `rates?` alone would false-positive on "interest rates" etc; we require it
// to appear near a market-adjacent noun or question phrasing.
const MARKETS_RE =
  /\b(markets?|pools?|apys?|earn rate|yield|rates?.{0,20}(right now|available|best|live)|(best|highest|top).{0,30}(rate|apy|yield|pool|market)|what.{0,20}(rate|apy|yield|pool|market))\b/i

/**
 * Classify the user's message into a prefetchable intent bucket.
 * Returns null when no confident match — caller skips prefetch.
 *
 * Portfolio is checked first — "what's the rate on my USDC?" matches both,
 * and the portfolio prefetch already includes enough context for that
 * specific question via `Routing Hints`. Only pure market queries flow to
 * the markets prefetch.
 */
export function classifyPrefetchIntent(content: string): PrefetchIntent {
  if (!content) return null
  const trimmed = content.trim()
  if (trimmed.length === 0 || trimmed.length > 500) return null
  if (PORTFOLIO_RE.test(trimmed)) return 'portfolio'
  if (MARKETS_RE.test(trimmed)) return 'markets'
  return null
}
