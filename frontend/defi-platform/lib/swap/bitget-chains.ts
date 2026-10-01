/**
 * Mapping from EVM chain IDs to Bitget Order Mode API chain slugs.
 * Bitget supports: ETH, SOL, BNB Chain, Base, Polygon, Arbitrum, Morph.
 * SOL excluded here (non-EVM).
 */
export const CHAIN_ID_TO_BITGET_SLUG: Record<number, string> = {
  1: 'eth',
  56: 'bnb',
  8453: 'base',
  42161: 'arbitrum',
  137: 'matic',
  2818: 'morph',
}

/** Set of chain IDs supported by Bitget Order Mode */
export const BITGET_CHAIN_IDS = new Set(
  Object.keys(CHAIN_ID_TO_BITGET_SLUG).map(Number)
)

/** Convert a chain ID to Bitget slug, or null if unsupported */
export function toBitgetSlug(chainId: number): string | null {
  return CHAIN_ID_TO_BITGET_SLUG[chainId] ?? null
}

/** Native token sentinel — Bitget uses empty string for native assets */
export const NATIVE_TOKEN_ADDRESS = ''

/** Check if a token address represents the native token */
export function isNativeToken(address: string): boolean {
  return (
    address === '' ||
    address === '0x0000000000000000000000000000000000000000' ||
    address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  )
}
