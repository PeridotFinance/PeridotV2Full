/**
 * GET /api/agents/timeline/action?token=<confirmation_token>
 *
 * Look up a single Action Timeline row by its confirmation_token and return
 * enough state to hydrate an ActionButtonBlock on remount.
 *
 * Why this exists: sessionStorage is the fast path for remount recovery, but
 * it's scoped to the current tab/session. If the user switched tabs,
 * reloaded, or is in private-mode, the Block has no memory of the previous
 * outcome. Falling back to this server read — which the SSE stream already
 * makes authoritative — gives us a cross-tab/cross-reload guarantee.
 *
 * Ownership is enforced strictly: the action's user_address must match the
 * caller's Privy-resolved EVM address. Otherwise 403.
 *
 * Response shape (minimal — only what the Block needs to hydrate):
 *   {
 *     status: ActionStatus,
 *     statusLabel: string,
 *     primaryHash: string | null,
 *     amount: string,
 *     assetSymbol: string,
 *     actionType: string,
 *     errorMessage: string | null,
 *     terminal: boolean
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import {
  getActionByToken,
  statusLabel,
  isTerminal,
} from '@/lib/agents/action-timeline'

export async function GET(request: NextRequest) {
  // ── Auth: E2E | Privy | Stellar-wallet session (Stufe 3) ───────────
  const auth = await authenticateAgentRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userAddress = auth.userAddress

  // ── Locate action ─────────────────────────────────────────────────
  const confirmationToken = request.nextUrl.searchParams.get('token')
  if (!confirmationToken) {
    return NextResponse.json(
      { error: 'token query parameter is required' },
      { status: 400 },
    )
  }

  const action = await getActionByToken(confirmationToken)
  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  }
  if (action.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    status: action.status,
    statusLabel: statusLabel(action.status),
    primaryHash: action.primaryHash,
    amount: action.amount,
    amountUsd: action.amountUsd,
    assetSymbol: action.assetSymbol,
    actionType: action.actionType,
    errorMessage: action.errorMessage,
    terminal: isTerminal(action.status),
  })
}
