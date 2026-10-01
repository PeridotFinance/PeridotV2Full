/**
 * Tests — useWalletBalance, Stellar branch.
 *
 * Regression: on the Stellar-only host the chain picker is hidden, so
 * `selectedNetworkId` is stuck at the preset default ("bnb"). The hook used to
 * gate its Stellar path on that value and to read the address from
 * `useActiveWallet` (which returns the EVM address whenever an EVM signer
 * exists). Either one sent a Soroban asset down the EVM branch, where it has no
 * contract and always reads 0 — which zeroed the wallet chip and disabled the
 * percent chips and the deposit CTA in the expert Supply panel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("wagmi", () => ({
  useAccount: () => ({ chainId: 56 }),
  useBalance: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useReadContract: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
}))

// The EVM signer is present and the selected network is BSC — exactly the state
// the bug needed. If the hook honours either, the balance comes back 0.
vi.mock("@/hooks/use-active-wallet", () => ({
  useActiveWallet: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}))

const STELLAR_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

vi.mock("@/hooks/use-stellar-wallet", () => ({
  useStellarWallet: () => ({ address: STELLAR_ADDRESS, isConnected: true, isLoading: false }),
}))

const stellarGetTokenBalance = vi.fn(async () => "1234500000") // 123.45 @ 7 decimals

vi.mock("@/lib/stellar-soroban-lending", () => ({
  getStellarVaultConfig: (assetId: string) =>
    assetId === "eurc-stellar"
      ? {
          vaultId: "CD3WN3PLW63HFZXE56OTRLMBV46WG54TFPGRL4RDQ43HQTTWVB4RPO3G",
          underlying: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
          decimals: 7,
        }
      : null,
  stellarGetTokenBalance: (...args: any[]) => stellarGetTokenBalance(...(args as [])),
  stellarGetNativeXlmBalance: vi.fn(async () => "0"),
}))

// Pins the scenario the bug needed: an EVM network is selected and the user
// cannot change it (the Stellar-only host hides the chain picker).
vi.mock("@/context", () => ({
  useNetworkContext: () => ({ selectedNetworkId: "bnb" }),
}))

vi.mock("@/data/market-data", () => ({ getAssetContractAddresses: () => null }))
vi.mock("@/biconomy/constants", () => ({ TOKENS: {} }))
vi.mock("@/config/contracts", () => ({ getConfiguredUnderlyingDecimals: () => undefined }))

// Must be after all vi.mock calls
import { useWalletBalance } from "@/hooks/use-wallet-balance"

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useWalletBalance — Soroban assets", () => {
  beforeEach(() => {
    stellarGetTokenBalance.mockClear()
  })

  it("reads a Soroban balance even while an EVM network is selected", async () => {
    const { result } = renderHook(() => useWalletBalance({ assetId: "eurc-stellar" }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.numericBalance).toBeGreaterThan(0))
    expect(result.current.numericBalance).toBeCloseTo(123.45, 4)
  })

  it("queries the Stellar address, not the EVM one from useActiveWallet", async () => {
    renderHook(() => useWalletBalance({ assetId: "eurc-stellar" }), { wrapper })

    await waitFor(() => expect(stellarGetTokenBalance).toHaveBeenCalled())
    const [, addressArg] = stellarGetTokenBalance.mock.calls[0] as unknown as string[]
    expect(addressArg).toBe(STELLAR_ADDRESS)
  })

  it("never falls through to the EVM branch for a Soroban asset", async () => {
    const { result } = renderHook(() => useWalletBalance({ assetId: "eurc-stellar" }), {
      wrapper,
    })

    // The EVM branch would fall back to 18 decimals and report no balance;
    // the vault's 7 decimals can only come from the Stellar result.
    await waitFor(() => expect(result.current.numericBalance).toBeGreaterThan(0))
    expect(result.current.decimals).toBe(7)
    expect(result.current.hasBalance).toBe(true)
  })
})
