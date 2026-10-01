/**
 * Tests — usePTokenBalance, Stellar branch.
 *
 * Regression: right after a successful deposit, expert-mode Withdraw showed
 * "No supplied X to withdraw" and stayed that way across refreshes, while
 * Borrow correctly saw the same deposit as collateral. Cause was the same wrong
 * gate as in `useWalletBalance` — the Stellar read only fired when
 * `selectedNetworkId` was Stellar, which the Stellar-only host can never
 * satisfy because it hides the chain picker. The position therefore came back
 * from the EVM branch as 0.
 *
 * Borrow was unaffected because it reads `preview_borrow_max` off the Stellar
 * wallet directly — which is exactly why the two disagreed.
 */

import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

const USDC_VAULT = "CBVGHUZ3EPTNCTAOBHKPTBLLXHYRWG4EQ7HPBUXAMFQNZQOFCS5S3YQP"
const EURC_VAULT = "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZK4FJ2RGBHOFOFN"

const { stellarGetPtokenBalance, stellarGetExchangeRate } = vi.hoisted(() => ({
  // 100 pTokens @ 6 decimals, exchange rate 1.5 → 150 underlying.
  // The EURC vault never resolves unless a test resolves it, so the window
  // between "asset switched" and "new position arrived" stays observable.
  stellarGetPtokenBalance: vi.fn(async (vaultId: string) =>
    vaultId === "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZK4FJ2RGBHOFOFN"
      ? new Promise<string>(() => {})
      : "100000000",
  ),
  stellarGetExchangeRate: vi.fn(async () => "1500000"),
}))

vi.mock("wagmi", () => ({
  useAccount: () => ({ chainId: 56 }),
  useReadContract: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
}))

// EVM signer present — so useActiveWallet hands back the 0x address, the second
// half of the original bug.
vi.mock("@/hooks/use-active-wallet", () => ({
  useActiveWallet: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}))

const STELLAR_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

vi.mock("@/hooks/use-stellar-wallet", () => ({
  useStellarWallet: () => ({ address: STELLAR_ADDRESS, isConnected: true, isLoading: false }),
}))

// Pins the scenario: an EVM network is selected and cannot be changed.
vi.mock("@/context", () => ({
  useNetworkContext: () => ({ selectedNetworkId: "bnb" }),
}))

vi.mock("@/lib/stellar-soroban-lending", () => ({
  getStellarVaultConfig: (assetId: string) =>
    assetId === "usdc-stellar"
      ? {
          vaultId: "CBVGHUZ3EPTNCTAOBHKPTBLLXHYRWG4EQ7HPBUXAMFQNZQOFCS5S3YQP",
          underlying: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          decimals: 7,
        }
      : assetId === "eurc-stellar"
        ? {
            vaultId: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZK4FJ2RGBHOFOFN",
            underlying: "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
            decimals: 7,
          }
        : null,
  stellarGetPtokenBalance,
  stellarGetExchangeRate,
}))

vi.mock("@/data/market-data", () => ({
  getAssetContractAddresses: () => null,
  AXELAR_CROSS_CHAIN_ASSET_IDS: [],
}))

// Must be after all vi.mock calls
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("usePTokenBalance — Soroban assets", () => {
  it("sees the supplied position while an EVM network is selected", async () => {
    const { result } = renderHook(() => usePTokenBalance({ assetId: "usdc-stellar" }))

    await waitFor(() => expect(result.current.numericBalance).toBeGreaterThan(0))
    // 100 pTokens × 1.5 = 150 underlying @ 7 decimals
    expect(result.current.numericBalance).toBeCloseTo(15, 6)
    expect(result.current.hasBalance).toBe(true)
  })

  it("reads the position with the Stellar address, not the EVM one", async () => {
    renderHook(() => usePTokenBalance({ assetId: "usdc-stellar" }))

    await waitFor(() => expect(stellarGetPtokenBalance).toHaveBeenCalled())
    const [, addressArg] = stellarGetPtokenBalance.mock.calls[0] as unknown as string[]
    expect(addressArg).toBe(STELLAR_ADDRESS)
  })

  it("does not report an empty position for a Soroban asset", async () => {
    // The symptom the user hit: Withdraw rendered its "nothing supplied" empty
    // state because this came back 0 from the EVM branch.
    const { result } = renderHook(() => usePTokenBalance({ assetId: "usdc-stellar" }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.numericBalance).not.toBe(0)
  })

  it("drops the old position immediately when the asset changes", async () => {
    // The manage dialog and the asset sheet keep this hook mounted and just swap
    // `assetId`. The supplied balance drives the withdraw MAX button, so showing
    // the previous market's position — even for one frame — pre-fills MAX with a
    // number the new market can't honour.
    const { result, rerender } = renderHook(
      ({ assetId }) => usePTokenBalance({ assetId }),
      { initialProps: { assetId: "usdc-stellar" } },
    )

    await waitFor(() => expect(result.current.numericBalance).toBeCloseTo(15, 6))

    // EURC's read never resolves, so anything non-zero here is leftover USDC.
    rerender({ assetId: "eurc-stellar" })

    expect(result.current.numericBalance).toBe(0)
    expect(result.current.hasBalance).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })
})
