/**
 * authorizeStellarAddress — the ownership gate on the address-scoped Stellar
 * routes (margin journal, keeper arms). Covers the path that was missing: a
 * kit/Freighter user with a signed session cookie and no Privy account.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const getUserById = vi.fn()
const verifyAuthToken = vi.fn()

vi.mock("@/lib/bridge/auth", () => ({
  getPrivyClient: () => ({ verifyAuthToken, getUserById }),
}))

import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { issueStellarSession, STELLAR_SESSION_COOKIE } from "@/lib/agents/stellar-session"

const G = "GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC"
const G2 = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2"

/** Minimal NextRequest stand-in: the helper only reads `cookies` + `headers`. */
function req(opts: { cookie?: string; bearer?: string } = {}) {
  return {
    cookies: { get: (name: string) => (name === STELLAR_SESSION_COOKIE && opts.cookie ? { value: opts.cookie } : undefined) },
    headers: { get: (name: string) => (name.toLowerCase() === "authorization" && opts.bearer ? `Bearer ${opts.bearer}` : null) },
  } as any
}

describe("authorizeStellarAddress", () => {
  beforeEach(() => {
    process.env.AGENT_STELLAR_SESSION_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa"
    verifyAuthToken.mockReset()
    getUserById.mockReset()
  })
  afterEach(() => {
    delete process.env.AGENT_STELLAR_SESSION_SECRET
  })

  it("accepts a Stellar session cookie bound to the address — no Privy call at all", async () => {
    const res = await authorizeStellarAddress(req({ cookie: issueStellarSession(G)! }), G)
    expect(res).toEqual({ ok: true, method: "stellar-session" })
    expect(verifyAuthToken).not.toHaveBeenCalled()
  })

  it("does not let one wallet's cookie read another wallet's journal", async () => {
    const res = await authorizeStellarAddress(req({ cookie: issueStellarSession(G2)! }), G)
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" })
  })

  it("rejects a tampered cookie", async () => {
    const token = issueStellarSession(G)!
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA")
    const res = await authorizeStellarAddress(req({ cookie: tampered }), G)
    expect(res.ok).toBe(false)
  })

  it("still accepts a Privy bearer whose linked accounts hold the address", async () => {
    verifyAuthToken.mockResolvedValue({ userId: "did:privy:1" })
    getUserById.mockResolvedValue({ linkedAccounts: [{ type: "wallet", chainType: "stellar", address: G }] })
    const res = await authorizeStellarAddress(req({ bearer: "tok" }), G)
    expect(res).toMatchObject({ ok: true, method: "privy" })
  })

  it("403s a Privy user asking for an address they haven't linked", async () => {
    verifyAuthToken.mockResolvedValue({ userId: "did:privy:1" })
    getUserById.mockResolvedValue({ linkedAccounts: [{ type: "wallet", chainType: "stellar", address: G2 }] })
    const res = await authorizeStellarAddress(req({ bearer: "tok" }), G)
    expect(res).toEqual({ ok: false, status: 403, error: "address_not_owned" })
  })

  it("falls through to the bearer when the cookie is stale, rather than failing outright", async () => {
    verifyAuthToken.mockResolvedValue({ userId: "did:privy:1" })
    getUserById.mockResolvedValue({ linkedAccounts: [{ type: "wallet", chainType: "stellar", address: G }] })
    const res = await authorizeStellarAddress(req({ cookie: "garbage.garbage", bearer: "tok" }), G)
    expect(res).toMatchObject({ ok: true, method: "privy" })
  })

  it("401s with no credential of either kind", async () => {
    const res = await authorizeStellarAddress(req(), G)
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" })
  })

  it("fails closed when the deployment has no session secret", async () => {
    const token = issueStellarSession(G)!
    delete process.env.AGENT_STELLAR_SESSION_SECRET
    const res = await authorizeStellarAddress(req({ cookie: token }), G)
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" })
  })
})
