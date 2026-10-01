// @vitest-environment node
/**
 * Live check of the Robinhood lending calls against mainnet state, without
 * signing anything: the exact RobinhoodCall objects the flows send are run in
 * order through eth_simulateV1 from a wallet that holds USDG, NVDA and
 * pTokens (the deployer), and each step must return code 0 and emit the
 * market's own event.
 *
 * Network-bound, so opt-in: RUN_ROBINHOOD_LIVE=1 npx vitest run tests/robinhood-lending-live.test.ts
 */
import { describe, expect, it } from "vitest"
import { createPublicClient, http, maxUint256, type Abi } from "viem"
import { ROBINHOOD_DEFAULT_RPC_URL } from "@/config/robinhood"
import { ROBINHOOD_LENDING_MARKETS, readRobinhoodLendingAccount, readRobinhoodLendingMarkets, robinhoodLendingLimit } from "@/lib/robinhood/lending"
import {
  approveLending,
  checkLendingCode,
  findLendingEvent,
  lendingBorrow,
  lendingEnterMarket,
  lendingExitMarket,
  lendingRepay,
  lendingSupply,
  lendingWithdraw,
} from "@/lib/robinhood/lending-flows"
import type { RobinhoodCall } from "@/lib/robinhood/calls"

const LIVE = process.env.RUN_ROBINHOOD_LIVE === "1"
const HOLDER = "0x94696d767e65a75581145646960FA0eC886cE5d2" as const
const [USDG, NVDA] = ROBINHOOD_LENDING_MARKETS

describe.skipIf(!LIVE)("Robinhood lending on mainnet (simulated)", () => {
  const client = createPublicClient({ transport: http(ROBINHOOD_DEFAULT_RPC_URL, { timeout: 60_000 }) })

  it("reads markets and a real account", async () => {
    const markets = await readRobinhoodLendingMarkets(client as any)
    const account = await readRobinhoodLendingAccount(client as any, HOLDER)
    for (const m of markets.markets) {
      expect(m.isListed).toBe(true)
      expect(m.priceUsd).toBeGreaterThan(0)
      expect(m.borrowApy).toBeGreaterThan(0)
    }
    const usdg = account.positions.find((p) => p.market.id === "usdg-robinhood")!
    expect(usdg.shares).toBeGreaterThan(0n)
    expect(robinhoodLendingLimit("withdraw", "usdg-robinhood", markets, account).max).toBeGreaterThan(0n)
  }, 60_000)

  it("runs supply, collateral, borrow, repay-all, exit and withdraw-all end to end", async () => {
    const steps: RobinhoodCall[] = [
      approveLending(USDG, 1_000_000n),
      lendingSupply(USDG, 1_000_000n),
      lendingEnterMarket(NVDA),
      // Borrowing also enters pUSDG as collateral (Compound's borrowAllowed does that).
      lendingBorrow(USDG, 500_000n),
      approveLending(USDG, 600_000n),
      lendingRepay(USDG, maxUint256),
      lendingExitMarket(NVDA),
      lendingWithdraw(USDG, 1_000_000n, false),
    ]
    const { results } = await client.simulateCalls({
      account: HOLDER,
      calls: steps.map((c) => ({ to: c.address, abi: c.abi as Abi, functionName: c.functionName, args: c.args as any })),
    })
    const outcome = results.map((r, i) => ({ id: steps[i].id, status: r.status, code: checkLendingCode(r.result) }))

    expect(outcome.every((o) => o.status === "success")).toBe(true)
    expect(outcome[1].code).toBeNull() // mint
    expect(outcome[2].code).toBeNull() // enter
    expect(outcome[3].code).toBeNull() // borrow
    expect(outcome[5].code).toBeNull() // repay all
    expect(outcome[6].code).toBeNull() // exit after repay
    expect(outcome[7].code).toBeNull() // withdraw

    const logsOf = (i: number) => ({ logs: (results[i] as any).logs ?? [] })
    expect(findLendingEvent(logsOf(1) as any, USDG, "Mint", HOLDER)).not.toBeNull()
    expect(findLendingEvent(logsOf(3) as any, USDG, "Borrow", HOLDER)).not.toBeNull()
    const repaid = findLendingEvent(logsOf(5) as any, USDG, "RepayBorrow", HOLDER)
    expect(repaid).not.toBeNull()
    expect(repaid!.accountBorrows).toBe(0n)
    expect(findLendingEvent(logsOf(7) as any, USDG, "Redeem", HOLDER)).not.toBeNull()
  }, 120_000)
})
