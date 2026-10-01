/**
 * Routing Intelligence — deterministic source-chain selection for
 * deposit-style agent actions.
 *
 * Given a user's portfolio (hub positions + spoke wallet balances), picks the
 * best source chain + tool for a "deposit this asset" intent. Output is
 * structured + has a `confidence` field so callers (Perry, server-side
 * validators) can decide whether to act silently, act + mention alternatives,
 * or ask the user.
 *
 * All rules are enforced here — the system prompt does NOT need to know
 * cross-chain minimums, hub-vs-spoke trade-offs, or fee floors. If the LLM
 * reads the `recommended` object and calls the indicated tool with the
 * indicated chain, the result is correct.
 *
 * Pure function; trivially testable.
 */

import type { WalletBalance } from '@/types/agents'

// ── Public types ───────────────────────────────────────────────────────

export type DepositTool = 'execute_deposit' | 'execute_cross_chain_supply'

export interface DepositSource {
  tool: DepositTool
  sourceChainId: number
  amount: string
  amountUsd: number | null
  reason: string
  /**
   * `true` when the source passes all feasibility checks (amount above
   * minimum, chain supported). `false` when the source is real but unusable
   * for this flow — we still surface it so Perry can explain why.
   */
  viable: boolean
  /** Set when `viable: false` — human-readable explanation. */
  blockReason?: string
}

export type RoutingConfidence = 'high' | 'medium' | 'low'

export interface DepositRoute {
  /** Best viable source. `null` if none of the candidates are viable. */
  recommended: DepositSource | null
  /** All other considered sources (viable + non-viable), sorted by preference. */
  alternatives: DepositSource[]
  confidence: RoutingConfidence
  /**
   * When `true`, the agent should ask the user which source to use rather
   * than act automatically. Set when we have multiple comparable viable
   * options and no explicit user preference.
   */
  requiresUserChoice: boolean
  /** Free-form notes for Perry to surface ("Skipped Arbitrum — below min"). */
  warnings: string[]
}

export interface PortfolioSnapshot {
  /** User's *wallet* balances (not pool positions). Deposit takes from here. */
  walletBalances: WalletBalance[]
}

export interface PlanDepositInput {
  assetSymbol: string
  portfolio: PortfolioSnapshot
  /** If the user said "from Arbitrum" or equivalent, pass the chain here. */
  userSpecifiedChain?: number
  /** Override default minimum (USD) for cross-chain supply. */
  minCrossChainUsd?: number
}

// ── Constants ──────────────────────────────────────────────────────────

const HUB_CHAIN_IDS = new Set([56, 97, 143, 10143, 50312])
const SUPPORTED_SPOKE_IDS = new Set([1, 42161, 10, 137, 8453, 43114])
/**
 * USD floor for cross-chain supply. Below this, the Biconomy MEE fee
 * (~$0.20–$0.80 depending on route) eats a meaningful fraction of the
 * transfer. The number is conservative — the real minimum depends on
 * source chain + token + current network fees, but we can't know that
 * up-front without a quote round-trip. Users can still force a small
 * transfer by typing an explicit chain, which skips the min check.
 */
const DEFAULT_MIN_CROSS_CHAIN_USD = 1.0

// ── Core ───────────────────────────────────────────────────────────────

/**
 * Pick the best source chain + tool for a deposit of `assetSymbol`.
 *
 * Decision layers (first match wins):
 *   A. User specified a chain → respect it (HIGH), even if not optimal.
 *   B. Only one viable source → pick it (HIGH).
 *   C. Largest balance is on a hub chain → pick it (HIGH, no bridge fee).
 *   D. Largest viable balance is ≥ 2× next → pick it (HIGH).
 *   E. Hub balance within 80% of largest spoke → prefer hub (HIGH).
 *   F. Top 2 viable sources within 5% of each other → LOW, ask user.
 *   G. Otherwise → pick largest (MEDIUM, mention alternative).
 *
 * `alternatives` always contains every candidate, so Perry can cite them.
 */
export function planDepositRoute(input: PlanDepositInput): DepositRoute {
  const assetSymbol = input.assetSymbol.toUpperCase()
  const minCrossChainUsd = input.minCrossChainUsd ?? DEFAULT_MIN_CROSS_CHAIN_USD

  const candidates = buildCandidates(
    assetSymbol,
    input.portfolio.walletBalances,
    minCrossChainUsd,
  )

  if (candidates.length === 0) {
    return {
      recommended: null,
      alternatives: [],
      confidence: 'high',
      requiresUserChoice: false,
      warnings: [`No ${assetSymbol} found in wallet on any supported chain.`],
    }
  }

  // ── Layer A: user specified a chain ─────────────────────────────
  if (input.userSpecifiedChain !== undefined) {
    const picked = candidates.find((c) => c.sourceChainId === input.userSpecifiedChain)
    if (picked) {
      return {
        recommended: picked.viable ? picked : null,
        alternatives: candidates.filter((c) => c !== picked),
        confidence: 'high',
        requiresUserChoice: false,
        warnings: picked.viable ? [] : [picked.blockReason ?? 'Requested source is not viable'],
      }
    }
    return {
      recommended: null,
      alternatives: candidates,
      confidence: 'high',
      requiresUserChoice: false,
      warnings: [
        `No ${assetSymbol} balance found on chain ${input.userSpecifiedChain}.`,
      ],
    }
  }

  // ── Layer B+: automatic ranking ────────────────────────────────
  const viable = candidates.filter((c) => c.viable)
  const warnings = candidates
    .filter((c) => !c.viable && c.blockReason)
    .map((c) => `${c.sourceChainId === 0 ? 'Source' : `Chain ${c.sourceChainId}`}: ${c.blockReason}`)

  if (viable.length === 0) {
    return {
      recommended: null,
      alternatives: candidates,
      confidence: 'high',
      requiresUserChoice: false,
      warnings: warnings.length > 0 ? warnings : ['No viable source for this amount.'],
    }
  }

  if (viable.length === 1) {
    return {
      recommended: viable[0],
      alternatives: candidates.filter((c) => c !== viable[0]),
      confidence: 'high',
      requiresUserChoice: false,
      warnings,
    }
  }

  // Sort by amountUsd descending (unknown USD goes last)
  const sortedViable = [...viable].sort((a, b) => {
    const au = a.amountUsd ?? -Infinity
    const bu = b.amountUsd ?? -Infinity
    return bu - au
  })

  const top = sortedViable[0]
  const next = sortedViable[1] ?? null
  const topUsd = top.amountUsd ?? 0
  const nextUsd = next?.amountUsd ?? 0

  // Layer C/E: hub bias — if any hub source has ≥80% of the largest spoke,
  // prefer the hub (saves bridge fee + 30s of waiting).
  const hubSource = sortedViable.find((c) => HUB_CHAIN_IDS.has(c.sourceChainId))
  if (hubSource && hubSource !== top) {
    const hubUsd = hubSource.amountUsd ?? 0
    // Require a real USD value on both sides: without prices we can't compare
    // sizes, so skip the hub-bias layer instead of short-circuiting with `0 >= 0`.
    if (topUsd > 0 && hubUsd >= topUsd * 0.8) {
      return {
        recommended: decorateHubReason(hubSource, top),
        alternatives: sortedViable.filter((c) => c !== hubSource),
        confidence: 'high',
        requiresUserChoice: false,
        warnings,
      }
    }
  }

  // Layer D: clear winner by size (≥ 2× next)
  if (topUsd > 0 && topUsd >= nextUsd * 2) {
    return {
      recommended: top,
      alternatives: sortedViable.slice(1),
      confidence: 'high',
      requiresUserChoice: false,
      warnings,
    }
  }

  // Layer F: too close to call — ask user
  if (nextUsd > 0 && topUsd > 0 && (topUsd - nextUsd) / topUsd < 0.05) {
    return {
      recommended: top,
      alternatives: sortedViable.slice(1),
      confidence: 'low',
      requiresUserChoice: true,
      warnings,
    }
  }

  // Layer G: medium — largest viable, but worth mentioning alternatives
  return {
    recommended: top,
    alternatives: sortedViable.slice(1),
    confidence: 'medium',
    requiresUserChoice: false,
    warnings,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildCandidates(
  assetSymbol: string,
  walletBalances: WalletBalance[],
  minCrossChainUsd: number,
): DepositSource[] {
  const matches = walletBalances.filter(
    (b) => b.assetSymbol.toUpperCase() === assetSymbol,
  )
  return matches.map((b) => {
    const isHub = HUB_CHAIN_IDS.has(b.chainId)
    const isSupportedSpoke = SUPPORTED_SPOKE_IDS.has(b.chainId)
    const amountNum = Number(b.amount)
    const amountUsd = b.amountUsd ?? null

    // Hub chain: direct deposit, no cross-chain fee. Any positive amount viable.
    if (isHub) {
      return {
        tool: 'execute_deposit' as const,
        sourceChainId: b.chainId,
        amount: b.amount,
        amountUsd,
        viable: Number.isFinite(amountNum) && amountNum > 0,
        reason: `Direct deposit on the hub chain — no bridge fee.`,
        blockReason:
          Number.isFinite(amountNum) && amountNum > 0
            ? undefined
            : 'Zero balance',
      }
    }

    // Spoke: cross-chain supply, minimum USD floor for fee economics.
    if (isSupportedSpoke) {
      const meetsMin = amountUsd == null ? true : amountUsd >= minCrossChainUsd
      return {
        tool: 'execute_cross_chain_supply' as const,
        sourceChainId: b.chainId,
        amount: b.amount,
        amountUsd,
        viable: Number.isFinite(amountNum) && amountNum > 0 && meetsMin,
        reason: `Cross-chain supply (~30s, fee deducted from the amount).`,
        blockReason:
          !meetsMin
            ? `Below the $${minCrossChainUsd.toFixed(2)} cross-chain minimum.`
            : Number.isFinite(amountNum) && amountNum > 0
              ? undefined
              : 'Zero balance',
      }
    }

    // Unsupported chain — surface but mark unviable
    return {
      tool: 'execute_cross_chain_supply' as const,
      sourceChainId: b.chainId,
      amount: b.amount,
      amountUsd,
      viable: false,
      reason: `Chain ${b.chainId} is not supported for cross-chain deposit.`,
      blockReason: `Chain ${b.chainId} is not in the supported deposit routes.`,
    }
  })
}

function decorateHubReason(hub: DepositSource, preferredOver: DepositSource): DepositSource {
  return {
    ...hub,
    reason:
      hub.reason
      + ` Preferred over chain ${preferredOver.sourceChainId} because the balances are comparable and staying on the hub avoids the bridge + wait.`,
  }
}

/**
 * Format a route for the portfolio tool's "Routing Hints" section.
 * One-line-per-asset for easy LLM parsing.
 */
export function formatRouteHint(
  assetSymbol: string,
  route: DepositRoute,
): string {
  const lines: string[] = []
  const sym = assetSymbol.toUpperCase()

  if (!route.recommended) {
    lines.push(`- **${sym}** → no viable source.`)
    if (route.warnings.length > 0) {
      lines.push(`  ${route.warnings.join('; ')}`)
    }
    return lines.join('\n')
  }

  const r = route.recommended
  const amountLabel = r.amountUsd != null
    ? `$${r.amountUsd.toFixed(2)}`
    : `${r.amount} ${sym}`
  const toolHint =
    r.tool === 'execute_deposit'
      ? `\`execute_deposit\` on chain ${r.sourceChainId}`
      : `\`execute_cross_chain_supply\` with sourceChainId=${r.sourceChainId}`

  lines.push(
    `- **${sym}** → ${toolHint} (${amountLabel} available). Confidence: ${route.confidence}.`,
  )

  if (route.alternatives.length > 0) {
    const altSummaries = route.alternatives.slice(0, 3).map((a) => {
      const label = a.amountUsd != null ? `$${a.amountUsd.toFixed(2)}` : `${a.amount} ${sym}`
      return a.viable
        ? `${label} on chain ${a.sourceChainId}`
        : `${label} on chain ${a.sourceChainId} (skip: ${a.blockReason ?? 'not viable'})`
    })
    lines.push(`  Other: ${altSummaries.join('; ')}.`)
  }

  if (route.requiresUserChoice) {
    lines.push(
      `  ⚠️  Confidence is LOW — ask the user which source they prefer instead of acting.`,
    )
  }

  return lines.join('\n')
}
