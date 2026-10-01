import { resolveLinkedWallets, normalizeLookupAddress, type LinkedWalletResolution } from "@/lib/linkedAccountResolver"

export interface AccountIdentity {
  accountKey: string
  accountId: number | null
  walletAddresses: string[]
  evmAddresses: string[]
  stellarAddresses: string[]
  displayWallet: string
  isOrphan: boolean
  cacheScopeKey: string
}

interface CacheEntry {
  identity: AccountIdentity
  expiresAt: number
}

const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 5_000

const cache = new Map<string, CacheEntry>()

function cacheKeyFor(input: string): string {
  return normalizeLookupAddress(input)
}

function pruneIfNeeded(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) return
  // Simple FIFO eviction — Maps iterate in insertion order
  const overflow = cache.size - CACHE_MAX_ENTRIES
  let removed = 0
  for (const key of cache.keys()) {
    cache.delete(key)
    if (++removed >= overflow) break
  }
}

function buildIdentity(input: string, resolution: LinkedWalletResolution): AccountIdentity {
  const normalized = normalizeLookupAddress(input)
  const accountKey =
    resolution.accountId !== null
      ? String(resolution.accountId)
      : (resolution.walletAddresses[0] || normalized).toLowerCase()

  // Display wallet: prefer first EVM, then first Stellar, then the input itself.
  const displayWallet =
    resolution.evmAddresses[0] || resolution.stellarAddresses[0] || normalized

  return {
    accountKey,
    accountId: resolution.accountId,
    walletAddresses: resolution.walletAddresses,
    evmAddresses: resolution.evmAddresses,
    stellarAddresses: resolution.stellarAddresses,
    displayWallet,
    isOrphan: resolution.accountId === null,
    cacheScopeKey: resolution.cacheScopeKey,
  }
}

export async function resolveAccountIdentity(walletAddress: string): Promise<AccountIdentity> {
  const key = cacheKeyFor(walletAddress)
  const now = Date.now()

  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.identity
  }

  const resolution = await resolveLinkedWallets(walletAddress)
  const identity = buildIdentity(walletAddress, resolution)

  cache.set(key, { identity, expiresAt: now + CACHE_TTL_MS })
  pruneIfNeeded()

  // Prime cache for every linked address so any wallet of the account hits.
  for (const addr of identity.walletAddresses) {
    const linkedKey = cacheKeyFor(addr)
    if (linkedKey === key) continue
    cache.set(linkedKey, { identity, expiresAt: now + CACHE_TTL_MS })
  }

  return identity
}

export function invalidateAccountIdentity(walletAddress: string): void {
  const key = cacheKeyFor(walletAddress)
  const entry = cache.get(key)
  cache.delete(key)
  if (!entry) return
  // Also drop sibling wallets in the same account so a re-link is observed.
  for (const addr of entry.identity.walletAddresses) {
    cache.delete(cacheKeyFor(addr))
  }
}

export function invalidateAllAccountIdentities(): void {
  cache.clear()
}

// Test helpers
export function __getCacheSizeForTests(): number {
  return cache.size
}
