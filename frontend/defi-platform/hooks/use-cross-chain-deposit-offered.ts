"use client"

/**
 * Should *this* host offer a cross-chain deposit?
 *
 * A CCTP deposit starts on an EVM chain with an EVM wallet, and
 * `peridot.finance/app` hides EVM entirely (see `config/stellarOnly.ts`).
 * Offering "deposit from Ethereum" on a surface with no way to connect an
 * Ethereum wallet would be a dead end. So the flow rides along with the full
 * multi-chain presentation: **v1.peridot.finance** and local dev — which is also
 * exactly where we want the first rollout.
 *
 * Resolves after mount like `useStellarOnly` does, so it starts `false` and
 * turns on for the v1 host. Starting hidden is the right default: a control that
 * appears is far less jarring than one that vanishes mid-glance.
 */

import { isCrossChainDepositEnabled } from "@/config/crossChainDeposit"
import { useStellarOnly } from "@/config/stellarOnly"

export function useCrossChainDepositOffered(): boolean {
  const stellarOnly = useStellarOnly()
  return isCrossChainDepositEnabled() && !stellarOnly
}
