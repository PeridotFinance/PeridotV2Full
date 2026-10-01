import { type Address } from 'viem'
import { bsc } from 'viem/chains'
import { createPublicClient, http } from 'viem'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import type { AccountType, SponsoredEligibility } from '@/types/wallet'
import { CHAIN_BY_ID } from '@/lib/biconomy/wallet'

type CapabilityProbeResult = 'supported' | 'ready' | 'unsupported'
type CapabilityProbeCacheValue = CapabilityProbeResult | 'error'

const capabilityProbeCache = new WeakMap<object, Map<string, CapabilityProbeCacheValue>>()

const CAPABILITY_PROBE_GLOBAL_KEY = '*'

const FATAL_CAPABILITY_ERROR_SNIPPETS = [
  'origins don\'t match',
  'origin does not match',
  'origin mismatch',
  'method not found',
  'unsupported method',
  'not supported',
  'permission denied',
]

const RETRY_CAPABILITY_ERROR_SNIPPETS = [
  'invalid params',
  'missing required',
  'expected array value',
]

function getCapabilityCache(ethereum: any): Map<string, CapabilityProbeCacheValue> | null {
  if (!ethereum) return null
  const target = (typeof ethereum === 'object' || typeof ethereum === 'function') ? (ethereum as object) : null
  if (!target) return null
  let cache = capabilityProbeCache.get(target)
  if (!cache) {
    cache = new Map<string, CapabilityProbeCacheValue>()
    capabilityProbeCache.set(target, cache)
  }
  return cache
}

function makeCapabilityCacheKey(from?: Address, chainId?: number): string {
  const addressPart = typeof from === 'string' && from ? from.toLowerCase() : CAPABILITY_PROBE_GLOBAL_KEY
  const chainPart = typeof chainId === 'number' ? String(chainId) : CAPABILITY_PROBE_GLOBAL_KEY
  return `${addressPart}:${chainPart}`
}

function getErrorMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const err = error as { message?: unknown; data?: unknown; cause?: unknown }
    if (typeof err.message === 'string') return err.message
    if (err.data && typeof err.data === 'object' && typeof (err.data as any)?.message === 'string') {
      return (err.data as any).message
    }
    if (typeof err.data === 'string') return err.data
    if (err.cause && typeof err.cause === 'object' && typeof (err.cause as any)?.message === 'string') {
      return (err.cause as any).message
    }
  }
  try {
    return JSON.stringify(error)
  } catch {
    return ''
  }
}

function shouldRetryCapabilitiesProbe(error: unknown): boolean {
  const code = (typeof error === 'object' && error !== null) ? (error as any).code : undefined
  if (code === -32601) return false // Method not found
  if (code === -32602) return true // Invalid params – try alternate shapes

  const message = getErrorMessage(error).toLowerCase()
  if (!message) return false

  if (RETRY_CAPABILITY_ERROR_SNIPPETS.some((snippet) => message.includes(snippet))) return true
  if (FATAL_CAPABILITY_ERROR_SNIPPETS.some((snippet) => message.includes(snippet))) return false

  return false
}

export async function detectSmartAccountViaCode(address: Address, chainId?: number, rpcUrl?: string): Promise<boolean> {
  try {
    const chain = (chainId && CHAIN_BY_ID[chainId]) ? CHAIN_BY_ID[chainId] : bsc
    const client = createPublicClient({ chain, transport: http(rpcUrl || chain.rpcUrls.public.http[0]) })
    const code = await client.getCode({ address })
    return !!code && code !== '0x'
  } catch {
    return false
  }
}

// Best-effort EIP-5792 capability probe for AppKit/embedded wallets
// Returns: 'supported' | 'ready' | 'unsupported' | null
export async function probeEip5792Capabilities(
  ethereum: any,
  from?: Address,
  chainId?: number,
  onResult?: (result: any) => void
): Promise<'supported' | 'ready' | 'unsupported' | null> {
  try {
    if (!ethereum) return null
    const cache = getCapabilityCache(ethereum)
    const cacheKey = cache ? makeCapabilityCacheKey(from, chainId) : null
    if (cache && cacheKey) {
      const cached = cache.get(cacheKey)
      if (cached) {
        return cached === 'error' ? null : cached
      }
    }

    let result: CapabilityProbeResult | null = null
    let encounteredError = false
    let fatalError = false

    const chainHex = typeof chainId === 'number' ? (`0x${chainId.toString(16)}`) : undefined

    // Primary: call wallet_getCapabilities if available
    if (typeof ethereum.request === 'function') {
      const attempts: Array<{ method: string; params?: any[] }> = []
      if (from || chainHex) {
        const accountPayload: Record<string, string> = {}
        if (from) accountPayload.account = from
        if (chainHex) accountPayload.chainId = chainHex
        attempts.push({ method: 'wallet_getCapabilities', params: [accountPayload] })

        const fromPayload: Record<string, string> = {}
        if (from) fromPayload.from = from
        if (chainHex) fromPayload.chainId = chainHex
        attempts.push({ method: 'wallet_getCapabilities', params: [fromPayload] })
      }
      attempts.push({ method: 'wallet_getCapabilities', params: [] })
      attempts.push({ method: 'wallet_getCapabilities' })

      for (const args of attempts) {
        try {
          const res: any = await ethereum.request(args as any)
          try {
            onResult?.(res)
          } catch {}
          const atomic = extractAtomicCapability(res)
          if (atomic) {
            result = atomic
            break
          }
        } catch (error) {
          encounteredError = true
          if (!shouldRetryCapabilitiesProbe(error)) {
            fatalError = true
            break
          }
        }
      }
    }

    if (!result && fatalError) {
      result = 'unsupported'
    }

    if (!result) {
      // Fallback: infer from provider capabilities/features
      const caps = (ethereum as any)?.capabilities || (ethereum as any)?.features || null
      if (caps) {
        const atomic = extractAtomicCapability(caps)
        if (atomic) {
          result = atomic
        } else {
          try {
            const text = JSON.stringify(caps).toLowerCase()
            if (text.includes('atomic') && (text.includes('true') || text.includes('supported'))) result = 'supported'
            else if (text.includes('atomic') && text.includes('ready')) result = 'ready'
            else if (text.includes('atomic')) result = 'unsupported'
          } catch {}
        }
      }
    }

    if (cache && cacheKey) {
      if (result) {
        cache.set(cacheKey, result)
      } else if (fatalError || encounteredError) {
        cache.set(cacheKey, 'error')
      }
    }

    return result
  } catch {
    return null
  }
}

function extractAtomicCapability(res: any): 'supported' | 'ready' | 'unsupported' | null {
  try {
    if (!res) return null
    // Direct shape: { atomic: 'supported'|'ready'|'unsupported'|true|false }
    if (typeof res === 'object' && 'atomic' in res) {
      const val = (res as any).atomic
      if (val === true || val === 'supported') return 'supported'
      if (val === 'ready') return 'ready'
      if (val === false || val === 'unsupported') return 'unsupported'
    }
    // Nested map shapes: recursively search for an 'atomic' key
    const seen = new Set<any>()
    const stack: any[] = [res]
    while (stack.length) {
      const node = stack.pop()
      if (!node || seen.has(node)) continue
      seen.add(node)
      if (typeof node === 'object') {
        if ('atomic' in node) {
          const val = (node as any).atomic
          if (val === true || val === 'supported') return 'supported'
          if (val === 'ready') return 'ready'
          if (val === false || val === 'unsupported') return 'unsupported'
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === 'object') stack.push(v)
        }
      }
    }
    return null
  } catch {
    return null
  }
}

export async function isEoa7702Capable(ethereum: any): Promise<boolean> {
  try {
    if (!ethereum?.request) return false
    // Best-effort probe for 7702/session-like capabilities without side effects
    // Many wallets expose capability flags or experimental methods
    const capabilities = (ethereum as any)?.capabilities || (ethereum as any)?.features || null
    if (capabilities) {
      const text = JSON.stringify(capabilities).toLowerCase()
      if (text.includes('7702') || text.includes('session') || text.includes('permission')) return true
    }
    // Try a harmless method existence check
    const maybe = (ethereum as any)?.providerConfig || (ethereum as any)?.wallet?.session || null
    return Boolean(maybe)
  } catch {
    return false
  }
}

export function getSponsoredEligibility(accountType: AccountType, chainId?: number): SponsoredEligibility {
  if (!FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES) return { eligible: false, reason: 'Feature disabled' }
  if (!chainId) return { eligible: false, reason: 'Unknown network' }
  if (accountType === 'SMART_ACCOUNT') return { eligible: true }
  if (accountType === 'EOA_7702') return { eligible: true, reason: 'Supported when wallet provides session authorization' }
  return { eligible: false, reason: 'Upgrade to enable gasless borrows' }
}

export async function getAccountTypeExternal(address?: Address, chainId?: number): Promise<AccountType> {
  try {
    if (!address) return 'EOA'
    const ethereum = typeof window !== 'undefined' ? (window as any)?.ethereum : null
    const isSmart = await detectSmartAccountViaCode(address, chainId)
    if (isSmart) return 'SMART_ACCOUNT'
    const eip7702 = await isEoa7702Capable(ethereum)
    return eip7702 ? 'EOA_7702' : 'EOA'
  } catch {
    return 'EOA'
  }
}

type SmartAccountStatusLike = { isSmartAccount?: boolean; classification?: string | null | undefined }

export function getAccountTypeFromProviderContext(status: SmartAccountStatusLike | null | undefined): AccountType {
  if (status?.isSmartAccount || status?.classification === 'smart-account') return 'SMART_ACCOUNT'
  return 'EOA'
}
