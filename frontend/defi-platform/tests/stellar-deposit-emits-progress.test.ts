/**
 * Tests — stellarDeposit actually emits its progress beats.
 *
 * Companion to `stellar-supply-progress.test.ts`, which pins how the beats are
 * worded. This one pins that they're *fired at all*, and in the right order:
 * enter market → approve → deposit, with a "confirm in your wallet" beat before
 * every signature and a "submitting" beat after it.
 *
 * Without this the narration can silently regress to one static label — the
 * exact bug this replaced — while the copy tests stay green.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Stellar SDK stub ──────────────────────────────────────────────────────────
// Just enough surface for the build → prepare → sign → submit → poll path.

// vi.mock factories are hoisted above the file's consts, so the shared spies
// have to be hoisted with them.
const { sendTransaction, getTransaction, signStellarXdr } = vi.hoisted(() => ({
  sendTransaction: vi.fn(async () => ({ status: "PENDING", hash: "TXHASH" })),
  getTransaction: vi.fn(async () => ({ status: "SUCCESS" })),
  signStellarXdr: vi.fn(async () => ({ signedTxXdr: "SIGNED_XDR" })),
}))

vi.mock("@stellar/stellar-sdk", () => {
  const fakeTx = { toXDR: () => "UNSIGNED_XDR" }

  class TransactionBuilder {
    addOperation() { return this }
    setTimeout() { return this }
    build() { return fakeTx }
    static fromXDR() { return fakeTx }
  }

  class RpcServer {
    getLatestLedger = async () => ({ sequence: 1000 })
    getAccount = async () => ({ sequenceNumber: () => "42" })
    prepareTransaction = async () => fakeTx
    sendTransaction = sendTransaction
    getTransaction = getTransaction
    // stellarGetUserMarkets swallows its own errors and falls back to [],
    // which is the "not entered yet" path we want to exercise.
    simulateTransaction = async () => { throw new Error("no simulation in test") }
  }

  return {
    Account: class { constructor(_a: string, _s: string) {} },
    Contract: class { constructor(_id: string) {} call() { return {} } },
    TransactionBuilder,
    Address: { fromString: () => ({ toScVal: () => ({}), toScAddress: () => ({}) }) },
    nativeToScVal: () => ({}),
    xdr: { ScVal: { scvAddress: () => ({}) } },
    rpc: { Server: RpcServer },
  }
})

vi.mock("@/lib/stellar-signer", () => ({ signStellarXdr }))

// Must be after all vi.mock calls
import {
  stellarDeposit,
  stellarWithdraw,
  stellarRepay,
} from "@/lib/stellar-soroban-lending"

const USER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

async function depositAndCollectBeats(): Promise<string[]> {
  const beats: string[] = []
  await stellarDeposit(USER, "usdc-stellar", "10", (m) => beats.push(m))
  return beats
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stellarDeposit — progress emission", () => {
  beforeEach(() => {
    signStellarXdr.mockClear()
    sendTransaction.mockClear()
  })

  it("emits a beat for every stage of a first-time deposit", async () => {
    const beats = await depositAndCollectBeats()
    expect(beats.length).toBeGreaterThanOrEqual(6)
  })

  it("asks for confirmation before each of the three signatures", async () => {
    const beats = await depositAndCollectBeats()
    const confirms = beats.filter((b) => /confirm in your wallet/i.test(b))
    // enter market + approve + deposit
    expect(confirms).toHaveLength(3)
    expect(signStellarXdr).toHaveBeenCalledTimes(3)
  })

  it("runs enter-market → approve → deposit in that order", async () => {
    const beats = await depositAndCollectBeats()
    const marketAccess = beats.findIndex((b) => /market access/i.test(b))
    const allowance = beats.findIndex((b) => /move your funds/i.test(b))
    const deposit = beats.findIndex((b) => /depositing/i.test(b))

    expect(marketAccess).toBeGreaterThanOrEqual(0)
    expect(allowance).toBeGreaterThan(marketAccess)
    expect(deposit).toBeGreaterThan(allowance)
  })

  it("follows every confirmation with a submit beat", async () => {
    const beats = await depositAndCollectBeats()
    const confirmIdxs = beats
      .map((b, i) => (/confirm in your wallet/i.test(b) ? i : -1))
      .filter((i) => i >= 0)

    for (const i of confirmIdxs) {
      expect(beats[i + 1]).toMatch(/submitting/i)
    }
  })
})

// The single-signature actions get their beats from buildSignAndSubmit, so they
// come along for free — but only as long as the callback is actually threaded
// through. That's what these pin.
describe("single-signature actions — progress emission", () => {
  beforeEach(() => {
    signStellarXdr.mockClear()
  })

  it("narrates a withdraw", async () => {
    const beats: string[] = []
    await stellarWithdraw(USER, "usdc-stellar", "5", (m) => beats.push(m))

    expect(beats.some((b) => /confirm in your wallet/i.test(b))).toBe(true)
    expect(beats.some((b) => /submitting/i.test(b))).toBe(true)
  })

  it("narrates a repay", async () => {
    const beats: string[] = []
    await stellarRepay(USER, "usdc-stellar", "5", (m) => beats.push(m))

    expect(beats.some((b) => /confirm in your wallet/i.test(b))).toBe(true)
    expect(beats.some((b) => /submitting/i.test(b))).toBe(true)
  })

  it("asks for confirmation before it submits, never after", async () => {
    const beats: string[] = []
    await stellarWithdraw(USER, "usdc-stellar", "5", (m) => beats.push(m))

    expect(beats.findIndex((b) => /confirm in your wallet/i.test(b)))
      .toBeLessThan(beats.findIndex((b) => /submitting/i.test(b)))
  })
})
