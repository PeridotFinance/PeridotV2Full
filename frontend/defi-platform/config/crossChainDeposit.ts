/**
 * Is the cross-chain deposit feature switched on?
 *
 * Deliberately server- and client-safe: API routes import this, so it must not
 * pull in anything with a `"use client"` banner. The *presentation* question —
 * should this host offer it at all — lives in
 * `hooks/use-cross-chain-deposit-offered.ts`, which can.
 *
 * The asymmetry that matters: the *start* of a deposit is gated, its
 * *continuation* is not. Turning the flag off must never strand a transfer that
 * is already in flight — the USDC has left the source chain and only the relay
 * can complete it. So the flag guards the plan and the burn record; the status
 * read, the manual advance and the cron keep working regardless. A kill switch
 * that traps money is not a kill switch.
 */

import { FEATURE_FLAGS } from "@/config/featureFlags"

export function isCrossChainDepositEnabled(): boolean {
  // `Boolean(...)` rather than `=== true`: the flag is a literal in a const
  // object, so TypeScript narrows it to `false` and rejects the comparison as
  // impossible. Flipping the flag must stay a one-character edit.
  return Boolean(FEATURE_FLAGS.CROSS_CHAIN_DEPOSIT_CCTP)
}
