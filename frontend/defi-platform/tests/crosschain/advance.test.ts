/**
 * The server's per-row step (`advanceSodaxTransfer`), shared by the status
 * route and the relay cron: when a hash is handed to SODAX, how a SODAX answer
 * becomes a row status, and what is given up on. Store and SODAX are mocked;
 * the SQL guards are exercised against Postgres in store-sql.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  markExpired: vi.fn(),
  markRelaying: vi.fn(),
  markSodaxFailed: vi.fn(),
  markSolved: vi.fn(),
  recordRelayAttempt: vi.fn(),
  recordSodaxStatus: vi.fn(),
}))
vi.mock("@/lib/cctp/store", () => store)

const sodax = vi.hoisted(() => ({
  sodaxSubmitTx: vi.fn(),
  sodaxSubmitTxStatus: vi.fn(),
}))
vi.mock("@/lib/crosschain/sodax", async (orig) => ({ ...(await orig<object>()), ...sodax }))

import { advanceSodaxTransfer } from "@/lib/crosschain/server"
import { SodaxApiError } from "@/lib/crosschain/sodax"
import type { SodaxTransfer } from "@/lib/cctp/store"

const NOW = Date.parse("2026-09-28T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function row(patch: Partial<SodaxTransfer>): SodaxTransfer {
  return {
    id: 7,
    rail: "sodax",
    direction: "in",
    stellar_address: "GA7JQB3VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    evm_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    src_chain: "8453",
    src_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    src_symbol: "USDC",
    src_decimals: 6,
    src_amount: "5000000",
    src_tx_hash: null,
    dst_chain: "stellar",
    dst_token: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    dst_symbol: "USDC",
    dst_decimals: 7,
    quoted_out: "49930000",
    min_out: "49430000",
    delivered_out: null,
    usd_value: 5,
    sodax_intent: { intentId: "1" },
    sodax_relay_data: "0xpayload",
    sodax_status: null,
    sodax_intent_hash: null,
    fill_tx_hash: null,
    intent_cancelled: null,
    deadline_at: ago(0),
    relay_attempts: 0,
    last_error: null,
    status: "created",
    status_history: [],
    supply_tx_hash: null,
    fail_reason: null,
    created_at: ago(60_000),
    updated_at: ago(60_000),
    ...patch,
  }
}

const HASH = `0x${"ab".repeat(32)}`

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of Object.values(store)) fn.mockImplementation(async (id: number) => ({ id, marked: true }))
})

describe("created", () => {
  it("expires only after the deadline plus grace, and only without a hash", async () => {
    await advanceSodaxTransfer(row({ deadline_at: ago(10 * 60_000) }), { now: NOW })
    expect(store.markExpired).not.toHaveBeenCalled()
    await advanceSodaxTransfer(row({ deadline_at: ago(16 * 60_000) }), { now: NOW })
    expect(store.markExpired).toHaveBeenCalledWith(7)
  })
})

describe("submitted", () => {
  const submitted = (updatedAgo: number) => row({ status: "submitted", src_tx_hash: HASH, updated_at: ago(updatedAgo) })

  it("waits for the tab's confirmation for a minute, then hands over on its own", async () => {
    await advanceSodaxTransfer(submitted(10_000), { now: NOW })
    expect(sodax.sodaxSubmitTx).not.toHaveBeenCalled()

    await advanceSodaxTransfer(submitted(10_000), { now: NOW, confirmed: true })
    expect(sodax.sodaxSubmitTx).toHaveBeenCalledTimes(1)

    await advanceSodaxTransfer(submitted(61_000), { now: NOW })
    expect(sodax.sodaxSubmitTx).toHaveBeenCalledTimes(2)
    expect(store.markRelaying).toHaveBeenCalledWith(7, "pending")
  })

  it("hands SODAX the EVM sender checksummed for 'in', the G-address for 'out'", async () => {
    await advanceSodaxTransfer(submitted(0), { now: NOW, confirmed: true })
    expect(sodax.sodaxSubmitTx.mock.calls[0][0]).toMatchObject({
      txHash: HASH,
      srcChainKey: "0x2105.base",
      walletAddress: "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD",
      relayData: "0xpayload",
    })
    const out = row({
      status: "submitted",
      direction: "out",
      src_chain: "stellar",
      dst_chain: "56",
      src_tx_hash: "cd".repeat(32),
    })
    await advanceSodaxTransfer(out, { now: NOW, confirmed: true })
    expect(sodax.sodaxSubmitTx.mock.calls[1][0]).toMatchObject({
      srcChainKey: "stellar",
      walletAddress: out.stellar_address,
      txHash: "cd".repeat(32),
    })
  })

  it("records a refused handover and retries, giving up only after a day", async () => {
    sodax.sodaxSubmitTx.mockRejectedValue(new Error("relay down"))
    await advanceSodaxTransfer(submitted(0), { now: NOW, confirmed: true })
    expect(store.recordRelayAttempt).toHaveBeenCalledWith(7, "relay down")
    expect(store.markSodaxFailed).not.toHaveBeenCalled()

    await advanceSodaxTransfer(
      row({ status: "submitted", src_tx_hash: HASH, created_at: ago(25 * 3600_000), updated_at: ago(0) }),
      { now: NOW, confirmed: true },
    )
    expect(store.markSodaxFailed).toHaveBeenCalled()
  })
})

describe("relaying", () => {
  const relaying = (patch: Partial<SodaxTransfer> = {}) =>
    row({ status: "relaying", src_tx_hash: HASH, sodax_status: "pending", ...patch })

  it("records solved with the fill tx", async () => {
    sodax.sodaxSubmitTxStatus.mockResolvedValue({
      status: "solved",
      result: { dstIntentTxHash: "0xhub", fillTxHash: "0xfill" },
    })
    await advanceSodaxTransfer(relaying(), { now: NOW })
    expect(store.markSolved).toHaveBeenCalledWith(7, { fillTxHash: "0xfill", intentHash: "0xhub" })
  })

  it("fails with where the money went when SODAX cancelled the intent", async () => {
    sodax.sodaxSubmitTxStatus.mockResolvedValue({ status: "failed", intentCancelled: true, failureReason: "expired" })
    await advanceSodaxTransfer(relaying(), { now: NOW })
    expect(store.markSodaxFailed).toHaveBeenCalledWith(
      7,
      "This didn't go through. Your money is back in your wallet on the network you sent from. (expired)",
      true,
    )
  })

  it("follows intermediate steps without changing the row's status", async () => {
    sodax.sodaxSubmitTxStatus.mockResolvedValue({ status: "posting_execution", result: { dstIntentTxHash: "0xhub" } })
    await advanceSodaxTransfer(relaying(), { now: NOW })
    expect(store.recordSodaxStatus).toHaveBeenCalledWith(7, "posting_execution", "0xhub")
    expect(store.markSolved).not.toHaveBeenCalled()
  })

  it("hands the hash over again when SODAX does not know it", async () => {
    sodax.sodaxSubmitTxStatus.mockRejectedValue(new SodaxApiError("Swap transaction not found", 404, null))
    sodax.sodaxSubmitTx.mockResolvedValue({ success: true, data: { status: "inserted" } })
    await advanceSodaxTransfer(relaying(), { now: NOW })
    expect(sodax.sodaxSubmitTx).toHaveBeenCalledTimes(1)
    expect(store.markSodaxFailed).not.toHaveBeenCalled()
  })

  it("leaves the row alone on a transient status error", async () => {
    sodax.sodaxSubmitTxStatus.mockRejectedValue(new SodaxApiError("bad gateway", 502, null))
    const r = relaying()
    expect(await advanceSodaxTransfer(r, { now: NOW })).toBe(r)
    expect(sodax.sodaxSubmitTx).not.toHaveBeenCalled()
  })

  it("gives up after three days unsettled", async () => {
    sodax.sodaxSubmitTxStatus.mockResolvedValue({ status: "relaying" })
    await advanceSodaxTransfer(relaying({ created_at: ago(73 * 3600_000) }), { now: NOW })
    expect(store.markSodaxFailed.mock.calls[0][1]).toMatch(/Not settled after 3 days \(last step: relaying\)/)
  })
})

describe("finished rows", () => {
  it("are never touched", async () => {
    for (const status of ["solved", "supplied", "dismissed", "failed", "expired"] as const) {
      await advanceSodaxTransfer(row({ status, src_tx_hash: HASH }), { now: NOW })
    }
    expect(sodax.sodaxSubmitTx).not.toHaveBeenCalled()
    expect(sodax.sodaxSubmitTxStatus).not.toHaveBeenCalled()
  })
})
