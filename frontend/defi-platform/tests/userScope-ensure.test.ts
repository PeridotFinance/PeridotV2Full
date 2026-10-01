import { describe, it, expect, vi, beforeEach } from 'vitest'

// ensureScopeOwnsAddress falls back to Privy's authoritative linked-wallet list
// on a DB miss (the first-login race) and lazily self-heals the link. Mock that
// boundary + the DB/Privy deps so the test is deterministic and never touches a
// real database or the Privy API.
//
// userScope.ts imports PrivyClient at module load; its real build refuses to
// run under jsdom. Stub it — ensureScopeOwnsAddress never touches it directly.
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class {} }))
vi.mock('@/app/api/account/wallet-links/_lib', () => ({
  fetchPrivyLinkedWallets: vi.fn(),
  upsertVerifiedEmbeddedLink: vi.fn(),
  getOrCreateAccountId: vi.fn(),
}))
vi.mock('@/lib/database', () => ({ query: vi.fn() }))
vi.mock('@/lib/tableResolver', () => ({
  getTableNames: () => ({ peridotAccounts: 'peridot_accounts', accountWalletLinks: 'account_wallet_links' }),
}))

import { ensureScopeOwnsAddress, type UserScope } from '@/lib/auth/userScope'
import {
  fetchPrivyLinkedWallets,
  upsertVerifiedEmbeddedLink,
  getOrCreateAccountId,
} from '@/app/api/account/wallet-links/_lib'

const mockFetch = fetchPrivyLinkedWallets as unknown as ReturnType<typeof vi.fn>
const mockUpsert = upsertVerifiedEmbeddedLink as unknown as ReturnType<typeof vi.fn>
const mockGetOrCreate = getOrCreateAccountId as unknown as ReturnType<typeof vi.fn>

const EVM = '0xAbCdef0123456789abcDEF0123456789AbCdEf01'
const EVM_LOWER = EVM.toLowerCase()
const OTHER_EVM = '0x1111111111111111111111111111111111111111'
const STELLAR = 'G' + 'A'.repeat(55)

// Convenience builders for the linked-wallet refs Privy returns.
const embeddedEvm = { namespace: 'evm' as const, address: EVM, normalized: EVM_LOWER, source: 'embedded' as const }
const externalEvm = { namespace: 'evm' as const, address: EVM, normalized: EVM_LOWER, source: 'external' as const }
const embeddedStellar = { namespace: 'stellar' as const, address: STELLAR, normalized: STELLAR, source: 'embedded' as const }

function makeScope(over: Partial<UserScope> = {}): UserScope {
  return {
    privyUserId: 'did:privy:test',
    accountId: 7,
    evmAddresses: [],
    stellarAddresses: [],
    ...over,
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockUpsert.mockReset()
  mockGetOrCreate.mockReset()
  mockUpsert.mockResolvedValue('inserted')
  mockGetOrCreate.mockResolvedValue(7)
})

describe('ensureScopeOwnsAddress', () => {
  it('fast path: address already in scope — no Privy call, no heal', async () => {
    const scope = makeScope({ evmAddresses: [EVM_LOWER] })

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('fallback (first-login race): grants access for an owned embedded wallet and self-heals', async () => {
    // DB scope is empty (verified link not yet written) — the exact race the fix targets.
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('did:privy:test')
    // Lazily persists the verified link, recording the embedded proof method...
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 7, namespace: 'evm', normalized: EVM_LOWER, verificationMethod: 'privy_embedded' }),
    )
    // ...and reflects it in the in-memory scope for the rest of the request.
    expect(scope.evmAddresses).toContain(EVM_LOWER)
  })

  it('fallback creates the account when scope.accountId is null', async () => {
    const scope = makeScope({ accountId: null })
    mockGetOrCreate.mockResolvedValueOnce(99)
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
    expect(mockGetOrCreate).toHaveBeenCalledWith('did:privy:test')
    expect(scope.accountId).toBe(99)
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ accountId: 99 }))
  })

  it('fallback works for an embedded Stellar wallet', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedStellar])

    const ok = await ensureScopeOwnsAddress(scope, STELLAR)

    expect(ok).toBe(true)
    expect(scope.stellarAddresses).toContain(STELLAR)
  })

  it('denies an address the session does not own (no heal)', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, OTHER_EVM)

    expect(ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('a failed self-heal still grants access (authz already proven by the token)', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])
    mockUpsert.mockRejectedValueOnce(new Error('db down'))

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
  })

  it('denies (does not throw) when the Privy lookup fails', async () => {
    const scope = makeScope()
    mockFetch.mockRejectedValueOnce(new Error('privy unreachable'))

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(false)
  })

  it('rejects malformed / empty addresses without calling Privy', async () => {
    const scope = makeScope()

    expect(await ensureScopeOwnsAddress(scope, 'not-an-address')).toBe(false)
    expect(await ensureScopeOwnsAddress(scope, '')).toBe(false)
    expect(await ensureScopeOwnsAddress(scope, null)).toBe(false)
    expect(await ensureScopeOwnsAddress(scope, undefined)).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('ensureScopeOwnsAddress — external wallets', () => {
  it('grants access for an external wallet linked through Privy, recording privy_linked', async () => {
    // MetaMask-via-Privy: Privy verified control with a signature at link time,
    // so the session owns it even though no DB row exists yet.
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([externalEvm])

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'evm', normalized: EVM_LOWER, verificationMethod: 'privy_linked' }),
    )
    expect(scope.evmAddresses).toContain(EVM_LOWER)
  })

  it('denies when the session has no linked wallets at all', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([])

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('ensureScopeOwnsAddress — edge cases', () => {
  it('matches case-insensitively: checksummed request vs lowercase Privy record', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, EVM) // mixed-case

    expect(ok).toBe(true)
    expect(scope.evmAddresses).toContain(EVM_LOWER)
  })

  it('tolerates surrounding whitespace in the requested address', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, `   ${EVM}   `)

    expect(ok).toBe(true)
  })

  it('grants access even when the link collides with another account (Privy is authoritative)', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])
    // upsert refuses to move an address another account already holds...
    mockUpsert.mockResolvedValueOnce('collision')

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    // ...but the caller still owns the wallet per Privy, so access is granted.
    expect(ok).toBe(true)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('picks the matching wallet when several linked wallets exist, mutating only that namespace', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm, embeddedStellar])

    const ok = await ensureScopeOwnsAddress(scope, EVM)

    expect(ok).toBe(true)
    expect(scope.evmAddresses).toContain(EVM_LOWER)
    expect(scope.stellarAddresses).toEqual([]) // untouched
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'evm' }))
  })

  it('denies a Stellar address when the session only owns an EVM wallet', async () => {
    const scope = makeScope()
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, STELLAR)

    expect(ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('IDOR guard: a caller cannot resolve a victim address Privy does not attribute to them', async () => {
    const scope = makeScope()
    // Attacker's own session resolves only to the attacker's wallet.
    mockFetch.mockResolvedValueOnce([embeddedEvm])

    const ok = await ensureScopeOwnsAddress(scope, OTHER_EVM) // the victim's address

    expect(ok).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
