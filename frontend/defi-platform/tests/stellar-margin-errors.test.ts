/**
 * Margin trap → user message mapping. Guards the regression where a raw on-chain
 * `UnreachableCodeReached` HostError (the "live opens not enabled yet" contract
 * gate) leaked to the toast instead of the calm gate message.
 */
import { describe, it, expect } from "vitest"
import {
  readableMarginError,
  isLiveTradingUnavailable,
  isDustFailure,
  isSlippageError,
  isOracleFloorError,
  ORACLE_FLOOR_SIGNATURE,
} from "@/app/app/margin/lib/stellarMarginErrors"
import { describeMinOutShortfall } from "@/app/app/margin/lib/marginMath"

// Abridged form of the real error the user hit (begin_open_position_v2 trap).
const HOST_ERROR =
  'HostError: Error(WasmVm, InvalidAction) Event log (newest first): 0: [Diagnostic Event] ' +
  'topics:[error, Error(WasmVm, InvalidAction)], data:["VM call trapped: UnreachableCodeReached", ' +
  "begin_open_position_v2] ... topics:[fn_return, is_borrow_paused], data:false"

describe("begin_open_position_v2 VM trap", () => {
  it("is classified as the live-trading-not-enabled gate", () => {
    expect(isLiveTradingUnavailable(new Error(HOST_ERROR))).toBe(true)
  })

  it("maps to the calm gate message, not the raw HostError", () => {
    const msg = readableMarginError(new Error(HOST_ERROR))
    expect(msg).toMatch(/Live trading is being finalized/i)
    expect(msg).not.toMatch(/HostError|UnreachableCodeReached|WasmVm/i)
  })

  it("a specific panic string still wins over the generic trap", () => {
    // A trap that also carries 'min position' should map to the specific message.
    const e = new Error('Error(WasmVm, InvalidAction): min position amount not met')
    expect(readableMarginError(e)).toMatch(/swap output fell below the minimum/i)
  })

  it("does not misfire the gate on an unrelated failure", () => {
    expect(isLiveTradingUnavailable(new Error("network is busy, please try again"))).toBe(false)
  })
})

describe("close budget trap (Error(Budget, ExceededLimit))", () => {
  // The exact host error a user photographed when the OLD atomic close_position_v3
  // blew the Soroban per-tx CPU budget. Must never leak raw to the toast.
  const BUDGET_ERROR = new Error("HostError: Error(Budget, ExceededLimit) DebugInfo not available")

  it("maps to human copy, never the raw HostError", () => {
    const msg = readableMarginError(BUDGET_ERROR)
    expect(msg).toMatch(/too complex to close in one step|step-by-step/i)
    expect(msg).not.toMatch(/HostError|ExceededLimit|Budget/i)
  })

  it("is not misclassified as the live-trading gate", () => {
    // The budget trap does not carry the wasm/unreachable signatures, so it must
    // not be swallowed by the calm 'coming soon' gate.
    expect(isLiveTradingUnavailable(BUDGET_ERROR)).toBe(false)
  })
})

/**
 * The oracle-band rejection. Measured live on 2026-07-30: the Aquarius XLM/USDT
 * testnet pool sat ~5.9% above the Reflector oracle (an 11.5k-XLM long had eaten
 * 3.7% of the XLM reserve), so EVERY long was rejected — $2 at 2× showed the same
 * gap as $400 at 2×. The UI answered "allow more price movement" and walked a
 * 100→4000 bps ladder that re-sent an identical `amount_with_slippage` each time.
 * These tests pin the classification that keeps that ladder off this failure.
 */
describe("oracle band vs user slippage", () => {
  // Reproduces the measured live case: floor 2200.1015 XLM, pool quote 2173.9905.
  const LIVE = { oracleMinOut: BigInt(22001015000), expectedOut: BigInt(21739905000) }

  it("is blocked and oracle-bound at every tolerance, including the ladder's top rung", () => {
    for (const slippageBps of [100, 200, 500, 1000, 2000, 4000]) {
      const s = describeMinOutShortfall({ ...LIVE, slippageBps })
      expect(s.blocked).toBe(true)
      expect(s.oracleBound).toBe(true)
    }
  })

  it("reports the gap against the protocol ceiling", () => {
    const s = describeMinOutShortfall({ ...LIVE, slippageBps: 100 })
    expect(s.maxGapPct).toBe(5)
    // Pool price premium over the oracle's own valuation of the notional.
    expect(s.poolGapPct).toBeGreaterThan(6)
    expect(s.poolGapPct).toBeLessThan(7)
  })

  /**
   * The identity the whole fix rests on: a pre-signature rejection can only ever
   * be the oracle floor. `userMinOut` is derived FROM `expectedOut`, so it can
   * never exceed it — there is no tolerance at which the user's own minimum is
   * the thing rejecting the quote. If this ever fails, the retry ladder has a
   * legitimate case again and the panel's guard needs revisiting.
   */
  it("blocked ⟺ oracle-bound: the user's tolerance can never be the binding constraint", () => {
    const floors = [BigInt(0), BigInt(9000), BigInt(9700), BigInt(9999), BigInt(10000), BigInt(12000)]
    for (const oracleMinOut of floors) {
      for (const slippageBps of [0, 100, 500, 4000, 9999]) {
        const s = describeMinOutShortfall({ oracleMinOut, expectedOut: BigInt(10000), slippageBps })
        expect(s.blocked).toBe(s.oracleBound)
      }
    }
  })

  it("a quote that clears the floor is never blocked, at any tolerance", () => {
    for (const slippageBps of [0, 100, 4000]) {
      const s = describeMinOutShortfall({ oracleMinOut: BigInt(9000), expectedOut: BigInt(9800), slippageBps })
      expect(s.blocked).toBe(false)
      expect(s.oracleBound).toBe(false)
    }
  })

  it("routes to the wait-it-out copy, never the raise-your-tolerance copy", () => {
    const e = new Error(`${ORACLE_FLOOR_SIGNATURE}: pool is 6.53% off the reference price, protocol allows 5%`)
    expect(isOracleFloorError(e)).toBe(true)
    // The critical exclusion: this must NOT drive the raise-tolerance callout.
    expect(isSlippageError(e)).toBe(false)
    const msg = readableMarginError(e)
    expect(msg).toMatch(/too far from the reference price/i)
    expect(msg).not.toMatch(/slippage|tolerance|smaller size/i)
  })

  it("a genuine user-tolerance rejection still gets the retry treatment", () => {
    const e = new Error("slippage too high")
    expect(isSlippageError(e)).toBe(true)
    expect(isOracleFloorError(e)).toBe(false)
    expect(readableMarginError(e)).toMatch(/Increase slippage tolerance/i)
  })

  it("the post-begin requote failure points at the pending, not the trade button", () => {
    const e = new Error("pending minimum no longer met by the live quote")
    // Collateral is locked on-chain; a tolerance retry would strand it.
    expect(isSlippageError(e)).toBe(false)
    const msg = readableMarginError(e)
    expect(msg).toMatch(/collateral is safe/i)
    expect(msg).toMatch(/pending trade/i)
    expect(msg).not.toMatch(/tolerance/i)
  })
})

describe("isDustFailure (finish shortfall vs hard revert)", () => {
  it("flags the interest-dust shortfall the contract reports", () => {
    expect(isDustFailure(new Error("debt remains after repay"))).toBe(true)
    expect(isDustFailure(new Error("insufficient proceeds to repay debt"))).toBe(true)
    expect(isDustFailure("Error: debt still remaining"))
      .toBe(true)
  })

  it("does not fire on unrelated failures (slippage, balance, gate)", () => {
    expect(isDustFailure(new Error("slippage too high"))).toBe(false)
    expect(isDustFailure(new Error("Error(WasmVm, InvalidAction)"))).toBe(false)
    expect(isDustFailure(new Error("network is busy"))).toBe(false)
  })
})

describe("wallet-side failures (nothing reached the network)", () => {
  it("gives the signature timeout its own copy, not the raw string", () => {
    // The exact shape buildSignSubmit throws when a wallet never answers.
    const msg = readableMarginError(new Error("Finish close: wallet did not respond in time"), "close")
    expect(msg).not.toMatch(/wallet did not respond in time/)
    expect(msg).toMatch(/didn't respond/i)
    // It must reassure without claiming nothing happened — the same error covers
    // a first attempt and a mid-close leg where earlier steps already landed.
    expect(msg).toMatch(/funds are safe/i)
    expect(msg).toMatch(/automatically/i)
  })

  it("reads a user cancellation as a cancellation, from any wallet's wording", () => {
    for (const raw of [
      "User declined access",
      "User rejected the request",
      "Action rejected by user",
      "Request rejected",
    ]) {
      expect(readableMarginError(new Error(raw))).toMatch(/cancelled this in your wallet/i)
    }
  })

  it("keeps contract diagnoses ahead of the wallet copy", () => {
    // A real trap must not be swallowed by the new entries sitting first in the map.
    expect(readableMarginError(new Error("slippage too high"))).toMatch(/tolerance/i)
    expect(readableMarginError(new Error("debt remains"))).toMatch(/interest/i)
  })
})

/**
 * The same VM trap, seen while CLOSING, must NOT reach the user as the calm
 * "live trading is being finalized" gate.
 *
 * Live on testnet 2026-08-11: `swap_close_position_v3` traps on entry for SHORT
 * positions — with min_out of 1 as readily as with the real one — so a trader
 * with an open, funded, healthy position was told that live trading wasn't ready
 * yet. That was false, and the message hid a real fault for three days.
 */
describe("close-path VM trap copy", () => {
  const SWAP_TRAP =
    'HostError: Error(WasmVm, InvalidAction) Event log (newest first): 0: [Diagnostic Event] ' +
    'topics:[error, Error(WasmVm, InvalidAction)], data:["VM call trapped: UnreachableCodeReached", ' +
    "swap_close_position_v3]"

  it("does not tell a user whose position is stuck that trading isn't live", () => {
    const msg = readableMarginError(new Error(SWAP_TRAP), "close")
    expect(msg).not.toMatch(/Live trading is being finalized/i)
  })

  it("says the position is untouched and owns the fault", () => {
    const msg = readableMarginError(new Error(SWAP_TRAP), "close")
    expect(msg).toMatch(/exactly as it was|untouched/i)
    expect(msg).toMatch(/our side|fault/i)
  })

  it("leaves the OPEN path's calm gate copy alone", () => {
    // Same trap, no close context: opening really can be gated off at the
    // contract, and the calm gate copy is the honest message there.
    expect(readableMarginError(new Error(SWAP_TRAP))).toMatch(/Live trading is being finalized/i)
  })

  it("never overrides a specific diagnosis with the generic close copy", () => {
    // A panic that carries a real reason keeps it — the rewrite is only for the
    // bare `unreachable` that says nothing at all.
    expect(readableMarginError(new Error("HostError: Error(WasmVm, InvalidAction) ... debt remains"), "close"))
      .toMatch(/interest/i)
    expect(readableMarginError(new Error("HostError: Error(WasmVm, InvalidAction) ... pending expired"), "close"))
      .toMatch(/Cancel it to recover/i)
  })
})
