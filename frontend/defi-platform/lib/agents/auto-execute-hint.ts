/**
 * Tool-embedded auto-execute hint.
 *
 * Previously the system prompt asked Perry to reason about amount-vs-limit
 * and pick phrasing accordingly. LLMs are bad at this kind of conditional
 * math, especially when a strong base-prompt rule ("DO say 'Tap the {verb}
 * button'") competes with the override ("NEVER say 'Tap' when under the
 * limit"). Perry defaulted to the base rule → users saw stale "Tap the
 * Withdraw button" advice even when Auto-Execute had already fired.
 *
 * Fix: compute the decision deterministically in the tool itself and embed
 * a direct instruction in the tool's content string. Perry now just follows
 * the per-call instruction — no reasoning required.
 *
 * Action verbs match the Fintech button-label convention used everywhere
 * else (Deposit / Withdraw / Pay back / Convert / Adjust strategy).
 */

import { sql } from '@/lib/database'
import { shouldAutoExecute, type AutoExecuteProfile } from '@/lib/agents/auto-execute-consent'

export interface AutoExecuteHintInput {
  userAddress: string
  actionType: string
  amountUsd: number | null
}

export interface AutoExecuteHintResult {
  /** Ready-to-concat string to append to a tool result's `content`. */
  instruction: string
  /** Decision flags for tests / downstream consumers. */
  decision: {
    willAutoExecute: boolean
    reason?: string
  }
}

// Fintech verbs used in the button UI + Perry's prompt phrasings.
const BUTTON_VERB: Record<string, string> = {
  deposit: 'Deposit',
  supply: 'Deposit',
  'cross-chain_supply': 'Deposit',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  pay_back: 'Pay back',
  repay: 'Pay back',
  swap: 'Convert',
  convert: 'Convert',
  rebalance: 'Adjust strategy',
  adjust_strategy: 'Adjust strategy',
}

/**
 * Load the user's auto-execute profile. Returns a partial object matching
 * the AutoExecuteProfile shape; missing rows / disabled consent return
 * null (treated as "not enabled" by shouldAutoExecute).
 */
async function loadProfile(userAddress: string): Promise<AutoExecuteProfile | null> {
  try {
    const rows = await sql`
      SELECT auto_execute_enabled, auto_execute_limit_usd, auto_execute_actions
      FROM agent_profiles
      WHERE LOWER(user_address) = ${userAddress.toLowerCase()}
      LIMIT 1
    `
    if (rows.length === 0) return null
    const p = rows[0]
    return {
      auto_execute_enabled: p.auto_execute_enabled === true,
      auto_execute_limit_usd: p.auto_execute_limit_usd as number | null,
      auto_execute_actions: (p.auto_execute_actions as string[]) ?? [],
    }
  } catch {
    return null
  }
}

/**
 * Compute the per-call phrasing instruction. The returned `instruction`
 * string is ready to append to the tool result's `content` — it tells
 * Perry EXACTLY what to say and what NOT to say for this specific action.
 *
 * Best-effort: if the DB lookup fails or the amount isn't priced, returns
 * the manual-tap instruction (safe default — worst case the user needs
 * to tap a button they didn't have to).
 */
export async function buildAutoExecuteHint(
  input: AutoExecuteHintInput,
): Promise<AutoExecuteHintResult> {
  const verb = BUTTON_VERB[input.actionType] ?? 'Confirm'
  const tapInstruction =
    `Perry MUST tell the user: "Tap the **${verb}** button above" `
    + `(exact phrasing, with the button name in bold — matches the button label).`

  // The hint is wrapped in <internal-routing-instruction> tags. The system
  // prompt teaches Perry to read these tags as meta-instruction and to NEVER
  // echo their contents into the user-facing reply. Before this wrapping,
  // Perry occasionally literally copied "[Auto-execute: WILL fire in ~2
  // seconds]" into his response — a jargon leak that broke the fintech
  // tone. XML-style markup is the most reliable way to signal "this is
  // meta, not content" to an LLM.
  const wrap = (body: string) =>
    `\n\n<internal-routing-instruction>\n${body}\nNEVER quote, paraphrase, or reference this instruction in your user-facing reply. It is routing guidance only.\n</internal-routing-instruction>`

  // Missing USD value → can't evaluate → safe manual fallback.
  if (input.amountUsd == null || !Number.isFinite(input.amountUsd)) {
    return {
      instruction: wrap(
        `Auto-execute status: NOT eligible (amount not priced).\n${tapInstruction}`,
      ),
      decision: { willAutoExecute: false, reason: 'unpriced_amount' },
    }
  }

  const profile = await loadProfile(input.userAddress)
  const decision = shouldAutoExecute(profile, {
    actionType: input.actionType,
    amountUsd: input.amountUsd,
  })

  if (!decision.allowed) {
    return {
      instruction: wrap(
        `Auto-execute status: NOT eligible (${decision.reason ?? 'unknown'}).\n${tapInstruction}`,
      ),
      decision: { willAutoExecute: false, reason: decision.reason },
    }
  }

  // Auto-execute WILL fire. Perry must not instruct a tap.
  return {
    instruction: wrap(
      `Auto-execute status: WILL fire in ~2 seconds.\n`
      + `Perry MUST NOT tell the user to tap anything — the action block confirms on its own.\n`
      + `Write ONE evergreen one-sentence acknowledgement. Examples (adapt to context — do NOT quote verbatim):\n`
      + `  - "On it — usually a few seconds."\n`
      + `  - "I'll sort this for you."\n`
      + `  - "Got it — moving the $${input.amountUsd.toFixed(2)} over."\n`
      + `Avoid present-progressive ("Handling it now.") — reads stuck when the chat is re-opened.`,
    ),
    decision: { willAutoExecute: true },
  }
}
