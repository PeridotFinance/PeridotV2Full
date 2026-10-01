/**
 * The trustline gate is the one CCTP precondition that cannot be recovered from
 * after the fact: once the burn is mined the USDC has left the source chain, and
 * a recipient without the trustline makes `mint_and_forward` revert atomically.
 * So these tests care about one property above all — the check never answers
 * "ready" unless it positively saw the trustline.
 */
import { describe, expect, it, vi, afterEach } from "vitest"
import { checkCctpRecipient, describeCctpBlocker } from "@/lib/cctp/trustline"
import { CCTP_STELLAR_ASSET } from "@/config/cctp"

const ADDRESS = "GA5O7MGIEXPQKWLP3PXFNSWSX5ICLDJJQM7RBR22X3YBRA6Z7GVRHJ3M"

function horizon(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response)
}

/** An account holding `xlm` XLM and `subentries` existing subentries. */
function account(xlm: number, subentries: number, extra: Record<string, unknown> = {}) {
  return {
    balances: [{ asset_type: "native", balance: xlm.toFixed(7) }],
    subentry_count: subentries,
    ...extra,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("checkCctpRecipient", () => {
  it("is ready only when the exact CCTP asset is trusted", async () => {
    vi.stubGlobal(
      "fetch",
      horizon({
        balances: [
          { asset_type: "native", balance: "10.0000000" },
          { asset_type: "credit_alphanum4", asset_code: CCTP_STELLAR_ASSET.code, asset_issuer: CCTP_STELLAR_ASSET.issuer },
        ],
      }),
    )
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.ready).toBe(true)
    expect(r.blocker).toBeNull()
  })

  it("does not accept the right code from the wrong issuer", async () => {
    // A USDC trustline to some other issuer is a different asset entirely. It
    // would look right in a wallet UI and still bounce the CCTP mint.
    vi.stubGlobal(
      "fetch",
      horizon({
        balances: [
          { asset_type: "native", balance: "10.0000000" },
          { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA6" },
        ],
      }),
    )
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.ready).toBe(false)
  })

  it("reports a missing account rather than a missing trustline", async () => {
    vi.stubGlobal("fetch", horizon({}, 404))
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.blocker).toBe("no_account")
  })

  it("fails closed when Horizon is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.ready).toBe(false)
    expect(r.blocker).toBe("unknown")
  })

  it("fails closed on a Horizon error status too", async () => {
    vi.stubGlobal("fetch", horizon({}, 503))
    expect((await checkCctpRecipient(ADDRESS)).blocker).toBe("unknown")
  })

  it("asks for a top-up when the wallet cannot cover the subentry reserve", async () => {
    // Base reserve is 2 entries (1 XLM) + 1 existing subentry (0.5) = 1.5 XLM
    // locked, plus 0.1 fee buffer. 1.7 XLM leaves 0.1 spendable — not the 0.5 a
    // new trustline needs.
    vi.stubGlobal("fetch", horizon(account(1.7, 1)))
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.blocker).toBe("no_reserve")
    expect(r.reserveShortfallRaw).toBeGreaterThan(0)
  })

  it("just needs the trustline when the reserve is comfortable", async () => {
    vi.stubGlobal("fetch", horizon(account(10, 1)))
    const r = await checkCctpRecipient(ADDRESS)
    expect(r.blocker).toBe("no_trustline")
    expect(r.reserveShortfallRaw).toBe(0)
  })

  it("does not charge the user for entries someone else sponsors", async () => {
    // Same balance, same subentry count, one difference: who pays for them.
    // Unsponsored, five subentries lock 3.5 XLM and 2.6 is not enough; with
    // three of them sponsored the account only carries 1.5 and has room.
    vi.stubGlobal("fetch", horizon(account(2.6, 5)))
    expect((await checkCctpRecipient(ADDRESS)).blocker).toBe("no_reserve")

    vi.stubGlobal("fetch", horizon(account(2.6, 5, { num_sponsored: 3 })))
    expect((await checkCctpRecipient(ADDRESS)).blocker).toBe("no_trustline")
  })
})

describe("describeCctpBlocker", () => {
  it("says nothing when nothing is wrong", () => {
    expect(describeCctpBlocker(null)).toBeNull()
  })

  it("names the actual shortfall so the user knows how much to add", () => {
    const copy = describeCctpBlocker("no_reserve", 3_000_000)
    expect(copy?.detail).toContain("0.30")
  })

  it("keeps chain jargon out of the copy", () => {
    for (const b of ["no_trustline", "no_reserve", "no_account", "unknown"] as const) {
      const copy = describeCctpBlocker(b, 5_000_000)
      expect(copy).not.toBeNull()
      expect(`${copy!.title} ${copy!.detail}`.toLowerCase()).not.toMatch(/trustline|subentry|issuer|soroban/)
    }
  })
})
