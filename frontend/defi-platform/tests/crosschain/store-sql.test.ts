// @vitest-environment node
/**
 * The SODAX half of lib/cctp/store.ts against a real Postgres, with both
 * migrations applied: the guarded transitions, the jsonb writes and the
 * separation from CCTP rows. Opt-in, because it needs a database:
 *
 *   XC_PG_URL=postgres://postgres@localhost:54329/xc npx vitest run tests/crosschain/store-sql.test.ts
 *
 * Point it at a throwaway database, never at production: it truncates the table.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type postgres from "postgres"

const { pg } = vi.hoisted(() => {
  const url = process.env.XC_PG_URL
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const make = require("postgres") as typeof postgres
  return { pg: url ? make(url, { max: 2, onnotice: () => {} }) : null }
})
// Without a database the store still has to import (it builds fragments at load).
vi.mock("@/lib/database", () => ({ sql: pg ?? (() => null) }))

import * as store from "@/lib/cctp/store"

const G = "GA7JQB3VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const H1 = `0x${"11".repeat(32)}`
const H2 = `0x${"22".repeat(32)}`

function input(patch: Partial<store.CreateSodaxTransferInput> = {}): store.CreateSodaxTransferInput {
  return {
    direction: "in",
    stellarAddress: G,
    evmAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    srcChain: "56",
    srcToken: "0x55d398326f99059ff775485246999027b3197955",
    srcSymbol: "USDT",
    srcDecimals: 18,
    srcAmount: "123456789012345678901",
    dstChain: "stellar",
    dstToken: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    dstSymbol: "USDC",
    dstDecimals: 7,
    quotedOut: "1230000000",
    minOut: "1217700000",
    usdValue: 123.46,
    intent: { intentId: "42", inputAmount: "123456789012345678901", nested: { a: [1, 2] } },
    relayData: "0xrelay",
    deadlineAt: new Date(Date.now() + 300_000),
    ...patch,
  }
}

describe.skipIf(!pg)("SODAX store against Postgres", () => {
  beforeAll(async () => {
    await pg!`TRUNCATE cctp_transfers RESTART IDENTITY`
    await pg!`INSERT INTO cctp_transfers (stellar_address, evm_address, source_domain, source_chain_id, amount_usdc, burn_tx_hash)
              VALUES (${G}, '0xold', 6, 8453, 10, '0xburn')`
  })
  afterAll(async () => {
    await pg?.end()
  })

  it("stores the intent as an object and 18-decimal amounts exactly", async () => {
    const row = await store.createSodaxTransfer(input())
    expect(row.status).toBe("created")
    expect(row.src_amount).toBe("123456789012345678901")
    expect(row.sodax_intent).toEqual({ intentId: "42", inputAmount: "123456789012345678901", nested: { a: [1, 2] } })
    const [{ t }] = await pg!`SELECT jsonb_typeof(sodax_intent) AS t FROM cctp_transfers WHERE id = ${row.id}`
    expect(t).toBe("object")
    expect(row.status_history.map((h) => h.status)).toEqual(["created"])
  })

  it("takes one hash per intent, idempotently", async () => {
    const row = await store.createSodaxTransfer(input())
    const a = await store.recordSourceTx(row.id, H1)
    expect(a?.status).toBe("submitted")
    const again = await store.recordSourceTx(row.id, H1)
    expect(again?.status).toBe("submitted")
    expect(again?.status_history.map((h) => h.status)).toEqual(["created", "submitted"])
    expect(await store.recordSourceTx(row.id, H2)).toBeNull()
  })

  it("refuses the same hash on a second row", async () => {
    const row = await store.createSodaxTransfer(input())
    await expect(store.recordSourceTx(row.id, H1)).rejects.toThrow(/cctp_transfers_src_tx_idx/)
  })

  it("walks submitted → relaying → solved → supplied, and nothing backwards", async () => {
    const row = await store.createSodaxTransfer(input())
    await store.recordSourceTx(row.id, `0x${"33".repeat(32)}`)
    expect((await store.markRelaying(row.id, "pending"))?.status).toBe("relaying")
    expect(await store.markRelaying(row.id, "pending")).toBeNull()
    expect((await store.recordSodaxStatus(row.id, "relayed", "0xhub"))?.sodax_status).toBe("relayed")
    expect(await store.recordSodaxStatus(row.id, "relayed", null)).toBeNull()
    const solved = await store.markSolved(row.id, { fillTxHash: "0xfill", intentHash: null })
    expect(solved).toMatchObject({ status: "solved", fill_tx_hash: "0xfill", sodax_intent_hash: "0xhub" })
    expect(await store.markSodaxFailed(row.id, "late error")).toBeNull()
    expect((await store.recordDelivered(row.id, G, "1229000000"))?.delivered_out).toBe("1229000000")
    expect(await store.recordDelivered(row.id, G, "1")).toBeNull()
    expect(await store.markSodaxSupplied(row.id, "GSOMEONEELSE", "ab".repeat(32))).toBeNull()
    expect((await store.markSodaxSupplied(row.id, G, "ab".repeat(32)))?.status).toBe("supplied")
    expect(await store.markSodaxDismissed(row.id, G)).toBeNull()
  })

  it("expires an unsent intent, and a late hash brings it back", async () => {
    const row = await store.createSodaxTransfer(input())
    expect((await store.markExpired(row.id))?.status).toBe("expired")
    expect((await store.recordSourceTx(row.id, `0x${"44".repeat(32)}`))?.status).toBe("submitted")
    expect(await store.markExpired(row.id)).toBeNull()
  })

  it("keeps the two rails apart", async () => {
    const cctpOpen = await store.listOpenTransfers()
    expect(cctpOpen.map((r) => r.burn_tx_hash)).toEqual(["0xburn"])
    const cctpMine = await store.listForAddress(G)
    expect(cctpMine).toHaveLength(1)
    const sodaxOpen = await store.listOpenSodaxTransfers()
    expect(sodaxOpen.every((r) => r.rail === "sodax")).toBe(true)
    expect(sodaxOpen.map((r) => r.status).sort()).toEqual(["created", "created", "submitted", "submitted"])
    const mine = await store.listSodaxForAddress(G)
    expect(mine.length).toBe(5)
    expect(await store.getSodaxTransfer(1)).toBeNull() // id 1 is the CCTP row
  })
})
