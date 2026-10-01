// @vitest-environment node
// Matches tests/stellar-signer.test.ts: stellar-base needs Node's crypto, and
// jsdom's randomness shim breaks Keypair.random().
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Actual from "@stellar/stellar-sdk"

/**
 * Unit tests — classic Stellar payments (lib/stellar-payment.ts)
 *
 * Horizon and the signer registry are stubbed, so nothing leaves the process.
 * What's being protected here is the stuff that silently misroutes real money:
 * the memo, and using the classic asset rather than the Soroban SAC id.
 */

/** Captures the XDR handed to the signer so we can inspect the built tx. */
let signedXdrSpy: string | null = null
/** What the stubbed Horizon submit should do. */
let submitBehaviour: () => unknown = () => ({ hash: "abc123" })

vi.mock("@/lib/stellar-signer", () => ({
  signStellarXdr: vi.fn(async (xdr: string) => {
    signedXdrSpy = xdr
    // Signature validity is stellar-signer.test.ts's job; here we only need an
    // XDR that round-trips through fromXDR.
    return { signedTxXdr: xdr }
  }),
}))

vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>()
  class MockServer {
    async loadAccount(address: string) {
      return new actual.Account(address, "123")
    }
    async submitTransaction() {
      return submitBehaviour()
    }
  }
  return { ...actual, Horizon: { ...actual.Horizon, Server: MockServer } }
})

// Static imports are safe despite the mocks above — vitest hoists vi.mock calls
// above the import graph, so these already see the stubs.
import {
  stellarSendClassicPayment,
  StellarPaymentError,
  describePaymentFailure,
  NATIVE_XLM,
} from "@/lib/stellar-payment"
import { stellarSorobanMainnetContracts } from "@/config/contracts"

const EURC = stellarSorobanMainnetContracts.classicAssets.EURC
const FROM = Actual.Keypair.random().publicKey()
const TO = Actual.Keypair.random().publicKey()

function builtTx(): Actual.Transaction {
  return Actual.TransactionBuilder.fromXDR(
    signedXdrSpy as string,
    stellarSorobanMainnetContracts.networkPassphrase,
  ) as Actual.Transaction
}

beforeEach(() => {
  signedXdrSpy = null
  submitBehaviour = () => ({ hash: "abc123" })
})

describe("stellarSendClassicPayment — guards", () => {
  it.each([
    ["0", "zero"],
    ["-1", "negative"],
    ["1.12345678", "8 decimal places (Stellar allows 7)"],
    ["abc", "not a number"],
    ["1e3", "exponent notation"],
  ])("rejects amount %s (%s) before touching the network", async (amount) => {
    await expect(
      stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount }),
    ).rejects.toBeInstanceOf(StellarPaymentError)
    expect(signedXdrSpy).toBeNull()
  })

  it("rejects an over-long memo rather than truncating it", async () => {
    // A truncated memo is still a VALID memo — it would route real money to the
    // wrong customer. Failing loudly is the only safe option.
    await expect(
      stellarSendClassicPayment({
        from: FROM,
        to: TO,
        asset: EURC,
        amount: "1",
        memo: "x".repeat(29),
      }),
    ).rejects.toThrow(/29 bytes.*at most 28/)
    expect(signedXdrSpy).toBeNull()
  })

  it("counts memo length in bytes, not characters", async () => {
    // 15 multi-byte chars = 45 bytes: fits `length <= 28` but not the protocol.
    await expect(
      stellarSendClassicPayment({
        from: FROM,
        to: TO,
        asset: EURC,
        amount: "1",
        memo: "é".repeat(15),
      }),
    ).rejects.toThrow(/30 bytes/)
  })

  it("accepts a memo of exactly 28 bytes", async () => {
    await expect(
      stellarSendClassicPayment({
        from: FROM,
        to: TO,
        asset: EURC,
        amount: "1",
        memo: "x".repeat(28),
      }),
    ).resolves.toBe("abc123")
  })
})

describe("stellarSendClassicPayment — built transaction", () => {
  it("builds a classic payment of the code+issuer asset, not the SAC id", async () => {
    await stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "12.5" })

    const op = builtTx().operations[0] as Actual.Operation.Payment
    expect(op.type).toBe("payment")
    expect(op.destination).toBe(TO)
    // Stellar stores amounts as stroops, so the round-trip pads to 7dp.
    expect(op.amount).toBe("12.5000000")
    // The Soroban SAC contract id (config `tokens.EURC`) would silently fail
    // here — a classic Horizon payment needs the issued-asset identity.
    expect(op.asset.getCode()).toBe("EURC")
    expect(op.asset.getIssuer()).toBe(EURC.issuer)
  })

  it("attaches the memo as MEMO_TEXT when given one", async () => {
    await stellarSendClassicPayment({
      from: FROM,
      to: TO,
      asset: EURC,
      amount: "1",
      memo: "12345",
    })
    const memo = builtTx().memo
    expect(memo.type).toBe("text")
    expect(memo.value?.toString()).toBe("12345")
  })

  it("attaches the memo as MEMO_ID when the memo type is id", async () => {
    // Exchanges that call it a "memo ID" / "destination tag" reject a text memo
    // carrying the same digits, so the encoding has to follow the toggle.
    await stellarSendClassicPayment({
      from: FROM,
      to: TO,
      asset: EURC,
      amount: "1",
      memo: "1234567890",
      memoType: "id",
    })
    const memo = builtTx().memo
    expect(memo.type).toBe("id")
    expect(memo.value?.toString()).toBe("1234567890")
  })

  it("rejects a non-numeric id memo before signing", async () => {
    await expect(
      stellarSendClassicPayment({
        from: FROM,
        to: TO,
        asset: EURC,
        amount: "1",
        memo: "not-a-number",
        memoType: "id",
      }),
    ).rejects.toBeInstanceOf(StellarPaymentError)
    expect(signedXdrSpy).toBeNull()
  })

  it("sends native XLM as the native asset, with its memo intact", async () => {
    await stellarSendClassicPayment({
      from: FROM,
      to: TO,
      asset: NATIVE_XLM,
      amount: "3",
      memo: "exchange-memo",
    })
    const op = builtTx().operations[0] as Actual.Operation.Payment
    expect(op.asset.isNative()).toBe(true)
    expect(builtTx().memo.value?.toString()).toBe("exchange-memo")
  })

  it("treats an empty memo as no memo", async () => {
    await stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "1", memo: "" })
    expect(builtTx().memo.type).toBe("none")
  })

  it("attaches no memo when the destination needs none", async () => {
    await stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "1" })
    expect(builtTx().memo.type).toBe("none")
  })

  it("returns the submit hash", async () => {
    submitBehaviour = () => ({ hash: "deadbeef" })
    await expect(
      stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "1" }),
    ).resolves.toBe("deadbeef")
  })
})

describe("stellarSendClassicPayment — submit failures", () => {
  it("surfaces Horizon result codes as a readable error", async () => {
    submitBehaviour = () => {
      throw {
        response: {
          data: { extras: { result_codes: { transaction: "tx_failed", operations: ["op_underfunded"] } } },
        },
      }
    }
    await expect(
      stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "1" }),
    ).rejects.toThrow(/Not enough balance/)
  })

  it("rethrows untouched when Horizon gave no result codes", async () => {
    const boom = new Error("network down")
    submitBehaviour = () => {
      throw boom
    }
    await expect(
      stellarSendClassicPayment({ from: FROM, to: TO, asset: EURC, amount: "1" }),
    ).rejects.toBe(boom)
  })
})

describe("describePaymentFailure", () => {
  it.each([
    [{ operations: ["op_underfunded"] }, /Not enough balance/],
    [{ operations: ["op_no_trust"] }, /can't accept this asset/],
    [{ operations: ["op_no_destination"] }, /doesn't exist/],
    [{ operations: ["op_low_reserve"] }, /more XLM/],
    [{ transaction: "tx_bad_seq" }, /out of sequence/],
    [{ transaction: "tx_insufficient_balance" }, /network fee/],
  ])("maps %o to user-facing copy", (codes, expected) => {
    expect(describePaymentFailure(codes)).toMatch(expected)
  })

  it("op_low_reserve tells the user to add XLM, never leaks the raw code", () => {
    // The exact failure a wallet hits enabling a second trustline (EURC after
    // USDC) with just enough XLM for the first — must read as an actionable
    // top-up prompt, not the opaque contract code.
    const msg = describePaymentFailure({ operations: ["op_low_reserve"] })
    expect(msg).toMatch(/add some XLM|more XLM/i)
    expect(msg).not.toMatch(/op_low_reserve/)
  })

  it("skips op_success to find the real failure", () => {
    expect(describePaymentFailure({ operations: ["op_success", "op_underfunded"] })).toMatch(
      /Not enough balance/,
    )
  })

  it("keeps an unmapped code verbatim rather than inventing a reason", () => {
    // An unknown code the user can quote to support beats a comforting lie.
    expect(describePaymentFailure({ operations: ["op_brand_new_code"] })).toBe(
      "op_brand_new_code",
    )
  })
})
