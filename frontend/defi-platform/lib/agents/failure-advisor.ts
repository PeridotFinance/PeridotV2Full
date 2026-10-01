/**
 * Given a failed transaction, produces a short Perry-style follow-up message
 * that explains what went wrong in fintech vocabulary and suggests concrete
 * next steps. Pure function — unit-testable in isolation.
 *
 * The message is injected into the chat as an ephemeral assistant message
 * (client-side only, not persisted) so the user gets immediate feedback
 * without waiting for the LLM to be re-prompted.
 */

export interface FailureAdvisoryInput {
  /** Fintech action vocabulary: 'deposit' | 'withdraw' | 'pay_back' | etc. */
  actionType: string
  /** Raw error message from the tx dispatch or server response. */
  errorMessage: string
  /** Human-readable asset symbol (e.g. "USDC"). Optional for generic advice. */
  assetSymbol?: string
}

export interface FailureAdvisory {
  /**
   * Whether to emit a chat message at all. We skip user-cancelled actions
   * (they made a conscious choice; nagging them is annoying) and already-
   * handled states (409 "already executed").
   */
  shouldEmit: boolean
  /** Chat text body (supports markdown). Empty when shouldEmit=false. */
  message: string
  /**
   * Optional short prompt the user can tap to re-pose the question back to
   * Perry as a normal chat turn (e.g. "Try a smaller amount"). Only set for
   * recoverable errors where a concrete follow-up makes sense. The chat UI
   * renders this as a chip beneath the advisory bubble; clicking it sends
   * the prompt through the same path as a typed message.
   */
  retryPrompt?: string
}

/**
 * Custom-error selectors used by Peridot / Compound Comptroller rejections.
 * Keep in sync with ActionButtonBlock.friendlyError.
 */
const REDEEM_REJECTION_RE = /0xb7abef56[0-9a-f]{0,56}0{0,64}([0-9a-f]{1,4})(?:[^0-9a-f]|$)/i
const BORROW_REJECTION_RE = /0x8cd22d19[0-9a-f]{0,56}0{0,64}([0-9a-f]{1,4})(?:[^0-9a-f]|$)/i

function verb(actionType: string): string {
  switch (actionType) {
    case 'supply':
    case 'deposit':
    case 'cross-chain_supply':
      return 'deposit'
    case 'withdraw':
      return 'withdrawal'
    case 'borrow':
      return 'borrow'
    case 'repay':
    case 'pay_back':
      return 'payment'
    case 'swap':
    case 'convert':
      return 'conversion'
    default:
      return 'action'
  }
}

/**
 * Perry's upbeat follow-up after a successful action. Kept deliberately short
 * — the ActionButtonBlock already shows a green success card, so this is just
 * conversational reinforcement. Used by the chat UI's success event listener.
 */
export function buildSuccessAdvisory(
  input: Pick<FailureAdvisoryInput, 'actionType' | 'assetSymbol'>,
): FailureAdvisory {
  const asset = input.assetSymbol ? input.assetSymbol.toUpperCase() : ''
  switch (input.actionType) {
    case 'deposit':
    case 'supply':
    case 'cross-chain_supply':
      return {
        shouldEmit: true,
        message: asset
          ? `Done — ${asset} is now earning for you. Happy to show your updated balance or suggest next moves.`
          : `All set — your deposit is earning. Let me know if you want to see the updated balance.`,
      }
    case 'withdraw':
      return {
        shouldEmit: true,
        message: asset
          ? `Done — I withdrew your ${asset}. Want to see your updated balance, or is there another move you'd like to make?`
          : `Done — that withdrawal went through. Let me know what's next.`,
      }
    case 'repay':
    case 'pay_back':
      return {
        shouldEmit: true,
        message: asset
          ? `Done — your ${asset} loan is paid down. You can check how much room that opens up for you.`
          : `Done — that payment went through.`,
      }
    case 'borrow':
      return {
        shouldEmit: true,
        message: asset
          ? `Done — you just borrowed ${asset}. Keep an eye on your health ratio; I can watch it for you.`
          : `Done — the borrow went through.`,
      }
    case 'swap':
    case 'convert':
      return {
        shouldEmit: true,
        message: `Done — the conversion went through.`,
      }
    case 'rebalance':
    case 'adjust_strategy':
      return {
        shouldEmit: true,
        message: `Done — your strategy is updated.`,
      }
    default:
      return {
        shouldEmit: true,
        message: `Done — that went through.`,
      }
  }
}

export function buildFailureAdvisory(
  input: FailureAdvisoryInput,
): FailureAdvisory {
  const raw = input.errorMessage ?? ''
  const lower = raw.toLowerCase()
  const actionVerb = verb(input.actionType)
  const asset = input.assetSymbol ? input.assetSymbol.toUpperCase() : ''

  // 1. Don't nag users who cancelled — their intent was clear.
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return { shouldEmit: false, message: '' }
  }

  // 2. Already executed (409) — the action succeeded earlier; don't re-advise.
  if (lower.includes('already been executed') || lower.includes('already executed')) {
    return { shouldEmit: false, message: '' }
  }

  // 3. Comptroller: liquidity shortfall on withdraw
  const redeemMatch = raw.match(REDEEM_REJECTION_RE)
  if (redeemMatch && parseInt(redeemMatch[1], 16) === 4) {
    return {
      shouldEmit: true,
      message:
        `I couldn't complete that ${actionVerb}${asset ? ` of ${asset}` : ''}. ` +
        `Your open loan leaves too little headroom — withdrawing that much would put your collateral below what's needed to back it.\n\n` +
        `**You can:**\n` +
        `- Pay back some of your loan first (even a small amount opens room)\n` +
        `- Try a smaller withdrawal — I can prepare "${actionVerb} ${asset ? '0.25 ' + asset : 'less'}" if you like\n` +
        `- Keep the deposit as-is for now`,
      retryPrompt: asset
        ? `Withdraw a smaller amount of ${asset}`
        : `Try a smaller withdrawal`,
    }
  }

  // 4. Comptroller: borrow would exceed safe limit
  const borrowMatch = raw.match(BORROW_REJECTION_RE)
  if (borrowMatch && parseInt(borrowMatch[1], 16) === 4) {
    return {
      shouldEmit: true,
      message:
        `I couldn't complete that ${actionVerb}. You'd be borrowing more than your collateral can safely back.\n\n` +
        `**You can:**\n` +
        `- Deposit more collateral first to raise your borrow limit\n` +
        `- Try a smaller borrow amount\n` +
        `- Check your current headroom — want me to show it?`,
      retryPrompt: 'Show my current borrow headroom',
    }
  }

  // 5. Gas sponsorship / paymaster rejection → we already fell back, but if
  //    we surfaced this to the user it means even the fallback popup failed.
  if (lower.includes('gas sponsorship') || lower.includes('paymaster')) {
    return {
      shouldEmit: true,
      message:
        `I couldn't sponsor the gas for that ${actionVerb}. Usually this happens when the app's gas pool is temporarily empty.\n\n` +
        `**You can:**\n` +
        `- Try again in a moment\n` +
        `- Or approve the popup that just asked you to sign — it'll use your own wallet's BNB for gas (typically under $0.05)`,
    }
  }

  // 6. Insufficient balance
  if (lower.includes('insufficient') && (lower.includes('balance') || lower.includes('fund'))) {
    return {
      shouldEmit: true,
      message:
        `That ${actionVerb}${asset ? ` of ${asset}` : ''} didn't go through — there isn't enough in your wallet to cover it right now.\n\n` +
        `**You can:**\n` +
        `- Top up your ${asset || 'wallet'} first\n` +
        `- Or try a smaller amount`,
      retryPrompt: asset
        ? `Try a smaller ${actionVerb} of ${asset}`
        : `Try a smaller amount`,
    }
  }

  // 7. Token expired (410) — user took too long to confirm
  if (lower.includes('expired') || lower.includes('confirmation link')) {
    return {
      shouldEmit: true,
      message:
        `That ${actionVerb} timed out before it was confirmed. Want me to set it up again?`,
      retryPrompt: `Set up that ${actionVerb} again`,
    }
  }

  // 8. Generic / unknown — don't pretend we understand, but acknowledge it.
  return {
    shouldEmit: true,
    message:
      `That ${actionVerb} didn't go through. Happy to try again, or tell me if you'd like to try something else.`,
    retryPrompt: `Try that ${actionVerb} again`,
  }
}
