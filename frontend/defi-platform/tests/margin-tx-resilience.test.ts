/**
 * The margin write path's retry classification.
 *
 * `buildSignSubmit` retries the pre-signature phase (getAccount → build →
 * prepare) only for failures that are about WHEN the request was made. That
 * split is the entire behaviour: retrying the wrong class wastes a trader's
 * ~2-ledger close window, and not retrying the right one ends a four-transaction
 * close on a single lagged simulation. So it gets pinned here rather than left
 * to a substring list nobody re-reads.
 */
import { describe, it, expect } from "vitest"
import { isTransientPrepareFailure, isTransportFailure } from "@/lib/stellar-margin"

describe("isTransientPrepareFailure — retry only what a later attempt can fix", () => {
  it("retries RPC transport failures", () => {
    for (const msg of [
      "TypeError: Failed to fetch",
      "502 Bad Gateway",
      "429 Too Many Requests",
      "request timeout",
      "socket hang up",
    ]) {
      expect(isTransientPrepareFailure(new Error(msg)), msg).toBe(true)
    }
  })

  it("retries a simulation run against a stale ledger snapshot", () => {
    // The exact shape that killed three of four closes: a close leg prepared on
    // a node that had not yet applied the leg before it. (The original pair,
    // begin_close → withdraw_close, is now one `prepare_close_position_v3`; the
    // lag it exposed still sits between prepare and swap.)
    expect(
      isTransientPrepareFailure(
        new Error('["VM call trapped: UnreachableCodeReached", swap_close_position_v3]'),
      ),
    ).toBe(true)
    expect(
      isTransientPrepareFailure(
        new Error('["trying to access contract data key outside of the footprint"]'),
      ),
    ).toBe(true)
  })

  it("does NOT retry a decision the contract made on the merits", () => {
    // Identical on every attempt — a retry only spends the close window.
    for (const msg of [
      "swap_close_position_v3 reverted on ledger: slippage too high",
      "reference price gap",
      "User declined access",
      "begin_open_position_v3 reverted on ledger: insufficient margin balance",
      "too many positions",
    ]) {
      expect(isTransientPrepareFailure(new Error(msg)), msg).toBe(false)
    }
  })

  it("survives non-Error throws", () => {
    expect(isTransientPrepareFailure(undefined)).toBe(false)
    expect(isTransientPrepareFailure(null)).toBe(false)
    expect(isTransientPrepareFailure("503 Service Unavailable")).toBe(true)
    expect(isTransientPrepareFailure({ message: "Load failed" })).toBe(true)
  })
})

/**
 * The READ path's half of the same classification.
 *
 * Reads fail soft — a null becomes a 0 balance, an empty position list, "no
 * pending close". That is right when the contract answered and the answer was
 * nothing, and dangerous when the request never landed: the close flow reads a
 * debt of 0 as "already closed" and files a close for a live position. So the
 * strict reads throw on transport and only on transport, which makes this
 * boundary the thing that decides whether a dropped request can be mistaken for
 * a fact about the chain.
 */
describe("isTransportFailure — only 'we never got an answer'", () => {
  it("is true for a request that never landed", () => {
    for (const msg of [
      "TypeError: Failed to fetch",
      "502 Bad Gateway",
      "503 Service Unavailable",
      "429 Too Many Requests",
      "request timeout",
      "socket hang up",
      "ECONNRESET",
    ]) {
      expect(isTransportFailure(new Error(msg)), msg).toBe(true)
    }
  })

  it("is false for a contract that answered", () => {
    // On a READ these are answers, not accidents: an empty position, an
    // unactivated account, a getter that panics for an id that doesn't exist.
    // Treating them as transport would retry three times and then throw where
    // the caller's default (0 / null) is the correct result.
    for (const msg of [
      '["VM call trapped: UnreachableCodeReached", get_position]',
      '["trying to access contract data key outside of the footprint"]',
      "slippage too high",
      "reference price gap",
    ]) {
      expect(isTransportFailure(new Error(msg)), msg).toBe(false)
    }
  })

  it("differs from the write path exactly on snapshot lag", () => {
    // The one deliberate disagreement between the two: a trap is worth another
    // try before a signature, and is a final answer for a read.
    const trap = new Error('["VM call trapped: UnreachableCodeReached", swap_close_position_v3]')
    expect(isTransientPrepareFailure(trap)).toBe(true)
    expect(isTransportFailure(trap)).toBe(false)
    // Everywhere else they agree.
    for (const msg of ["Failed to fetch", "504 Gateway Timeout", "User declined access"]) {
      expect(isTransportFailure(new Error(msg)), msg).toBe(isTransientPrepareFailure(new Error(msg)))
    }
  })

  it("survives non-Error throws", () => {
    expect(isTransportFailure(undefined)).toBe(false)
    expect(isTransportFailure({ message: "Load failed" })).toBe(true)
  })
})
