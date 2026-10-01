/**
 * Guards the Robinhood Chain registration against the two ways it can rot:
 * the ABI folder drifting from the deployer's manifest, and the chain
 * definition drifting from the manifest it claims to derive from.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { isAddress, getAddress } from "viem"

import manifest from "@/app/abis/robinhood/manifest.json"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_DECIMALS,
  ROBINHOOD_MARGIN,
  ROBINHOOD_PAIRS,
  ROBINHOOD_RECORDED_RISK,
  ROBINHOOD_TOKENS,
  robinhoodMainnet,
} from "@/config/robinhood"
import { CHAIN_IDS, chainConfigs, getChainConfig, isHubChain } from "@/config/contracts"
import { networks } from "@/config"
import { CHAIN_UTILS } from "@/lib/network-ids"

const ABI_DIR = path.join(process.cwd(), "app", "abis", "robinhood")

describe("Robinhood handout integrity", () => {
  it("every ABI file hashes to what the manifest recorded", () => {
    const artifacts = manifest.artifacts as Record<string, { abiFile: string; abiSha256: string }>
    for (const [key, artifact] of Object.entries(artifacts)) {
      const bytes = readFileSync(path.join(ABI_DIR, artifact.abiFile))
      const sha = createHash("sha256").update(bytes).digest("hex")
      expect(sha, `${key} (${artifact.abiFile})`).toBe(artifact.abiSha256)
    }
    expect(Object.keys(artifacts)).toHaveLength(16)
  })

  it("the ABI index exports one entry per manifest artifact", () => {
    expect(Object.keys(ROBINHOOD_ABIS).sort()).toEqual(Object.keys(manifest.artifacts).sort())
    for (const abi of Object.values(ROBINHOOD_ABIS)) {
      expect(Array.isArray(abi)).toBe(true)
      expect(abi.length).toBeGreaterThan(0)
    }
  })

  it("the executor ABI carries the entry points the guide documents", () => {
    const names = new Set(
      (ROBINHOOD_ABIS.executor as Array<{ type: string; name?: string }>)
        .filter((f) => f.type === "function" || f.type === "event" || f.type === "error")
        .map((f) => f.name),
    )
    for (const fn of [
      "openPosition",
      "closePosition",
      "addCollateral",
      "repayWithUnderlying",
      "repayWithPToken",
      "exitDebtFreeToPTokens",
      "positions",
      "nextPositionId",
      "PositionOpened",
      "PositionClosed",
    ]) {
      expect(names.has(fn), fn).toBe(true)
    }
  })
})

describe("Robinhood chain registration", () => {
  it("is chain 4663 with ETH gas and the handout RPC", () => {
    expect(ROBINHOOD_CHAIN_ID).toBe(4663)
    expect(robinhoodMainnet.id).toBe(manifest.chainId)
    expect(robinhoodMainnet.nativeCurrency.symbol).toBe("ETH")
    expect(robinhoodMainnet.rpcUrls.default.http).toContain(manifest.rpcURL)
    expect(robinhoodMainnet.testnet).toBe(false)
  })

  it("uses only valid checksummable addresses from the manifest", () => {
    const all = { ...ROBINHOOD_TOKENS, ...ROBINHOOD_MARGIN }
    for (const [name, addr] of Object.entries(all)) {
      expect(isAddress(addr), name).toBe(true)
      expect(getAddress(addr)).toBeTruthy()
    }
    expect(ROBINHOOD_MARGIN.executor.toLowerCase()).toBe(manifest.marginAddresses.executor.toLowerCase())
  })

  it("keeps the long and short tuples the executor expects", () => {
    expect(ROBINHOOD_PAIRS.long).toEqual({
      marginPToken: ROBINHOOD_TOKENS.pUSDG,
      positionPToken: ROBINHOOD_TOKENS.pNVDA,
      debtPToken: ROBINHOOD_TOKENS.pUSDG,
      side: 0,
    })
    expect(ROBINHOOD_PAIRS.short).toEqual({
      marginPToken: ROBINHOOD_TOKENS.pUSDG,
      positionPToken: ROBINHOOD_TOKENS.pUSDG,
      debtPToken: ROBINHOOD_TOKENS.pNVDA,
      side: 1,
    })
  })

  it("records the units and caps the guide was written against", () => {
    expect(ROBINHOOD_DECIMALS).toEqual({ USDG: 6, NVDA: 18, pToken: 8, usd18: 18 })
    expect(ROBINHOOD_RECORDED_RISK.maxLeverageX100).toBe(500)
    expect(ROBINHOOD_RECORDED_RISK.maxPositionValueUsd18).toBe(2n * 10n ** 18n)
    expect(ROBINHOOD_RECORDED_RISK.maxDebtValueUsd18).toBe(1n * 10n ** 18n)
  })

  it("is known to the chain helpers but is neither a hub nor a market chain", () => {
    expect(CHAIN_IDS.ROBINHOOD_MAINNET).toBe(4663)
    expect(getChainConfig(4663)).toBe(chainConfigs.robinhoodMainnet)
    expect(chainConfigs.robinhoodMainnet.markets).toEqual({})
    expect(isHubChain(4663)).toBe(false)
    expect(CHAIN_UTILS.networkIdFromChainId(4663)).toBe("robinhood")
    expect(CHAIN_UTILS.getNativeTokenSymbol(4663)).toBe("ETH")
  })

  it("is appended to the enabled networks exactly once and never first", () => {
    const ids = (networks as Array<{ id: number }>).map((n) => n.id)
    expect(ids.filter((id) => id === 4663)).toHaveLength(1)
    expect(ids[0]).not.toBe(4663)
  })
})
