import { BITGET_CHAIN_IDS } from './bitget-chains'
import type { SwapProvider } from './types'

/**
 * Select the swap provider based on source and destination chain.
 * Bitget handles both chains when both are in its supported set.
 * Everything else falls back to Squid.
 */
export function selectProvider(
  fromChainId: number,
  toChainId: number,
): SwapProvider {
  if (BITGET_CHAIN_IDS.has(fromChainId) && BITGET_CHAIN_IDS.has(toChainId)) {
    return 'bitget'
  }
  return 'squid'
}
