/**
 * Login kind → default view.
 *
 * Run: npx vitest run tests/login-kind.test.ts
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import {
  defaultViewModeFor,
  detectLoginKind,
  isEmbeddedWalletClientType,
  resolveLoginDefault,
} from "@/lib/login-kind"

const embeddedEvm = { type: "wallet", walletClientType: "privy", connectorType: "embedded" }
const embeddedStellar = { type: "wallet", walletClientType: "privy-v2", connectorType: "embedded" }
const metamask = { type: "wallet", walletClientType: "metamask", connectorType: "injected" }
const phantom = { type: "wallet", walletClientType: "phantom", connectorType: "solana_adapter" }

describe("detectLoginKind", () => {
  it("reads email and OAuth sign-ins as social", () => {
    expect(
      detectLoginKind({ authenticated: true, linkedAccounts: [{ type: "email" }, embeddedEvm, embeddedStellar], stellarSource: "privy" }),
    ).toBe("social")
    expect(detectLoginKind({ authenticated: true, linkedAccounts: [{ type: "google_oauth" }], stellarSource: undefined })).toBe("social")
    expect(detectLoginKind({ authenticated: true, linkedAccounts: [{ type: "passkey" }], stellarSource: undefined })).toBe("social")
  })

  it("keeps an account social when an external wallet is linked to it as well", () => {
    expect(
      detectLoginKind({ authenticated: true, linkedAccounts: [{ type: "email" }, metamask], stellarSource: "privy" }),
    ).toBe("social")
  })

  it("reads a MetaMask sign-in as a wallet sign-in despite the embedded Stellar wallet Privy adds", () => {
    expect(
      detectLoginKind({ authenticated: true, linkedAccounts: [metamask, embeddedStellar], stellarSource: "privy" }),
    ).toBe("evm-wallet")
  })

  it("counts a Solana wallet sign-in as a wallet sign-in", () => {
    expect(detectLoginKind({ authenticated: true, linkedAccounts: [phantom], stellarSource: undefined })).toBe("evm-wallet")
  })

  it("does not decide on embedded wallets alone", () => {
    expect(
      detectLoginKind({ authenticated: true, linkedAccounts: [embeddedEvm, embeddedStellar], stellarSource: "privy" }),
    ).toBeNull()
    expect(detectLoginKind({ authenticated: true, linkedAccounts: [], stellarSource: undefined })).toBeNull()
    expect(detectLoginKind({ authenticated: true, linkedAccounts: undefined, stellarSource: undefined })).toBeNull()
  })

  it("reads a Freighter-only session as a Stellar wallet sign-in", () => {
    expect(detectLoginKind({ authenticated: false, linkedAccounts: null, stellarSource: "kit" })).toBe("stellar-wallet")
  })

  it("knows nothing about a signed-out visitor", () => {
    expect(detectLoginKind({ authenticated: false, linkedAccounts: null, stellarSource: undefined })).toBeNull()
  })

  it("lets the Privy account win over a Freighter connection in the same browser", () => {
    expect(detectLoginKind({ authenticated: true, linkedAccounts: [{ type: "email" }], stellarSource: "kit" })).toBe("social")
  })
})

describe("defaultViewModeFor", () => {
  it("opens Easy for social and Expert for both wallet kinds", () => {
    expect(defaultViewModeFor("social")).toBe("easy")
    expect(defaultViewModeFor("evm-wallet")).toBe("expert")
    expect(defaultViewModeFor("stellar-wallet")).toBe("expert")
  })
})

describe("isEmbeddedWalletClientType", () => {
  it("covers both Privy wallet generations and nothing else", () => {
    expect(isEmbeddedWalletClientType("privy")).toBe(true)
    expect(isEmbeddedWalletClientType("privy-v2")).toBe(true)
    expect(isEmbeddedWalletClientType("metamask")).toBe(false)
    expect(isEmbeddedWalletClientType(undefined)).toBe(false)
  })
})

describe("resolveLoginDefault", () => {
  it("moves a first-time wallet sign-in to Expert and writes the cookie", () => {
    expect(resolveLoginDefault({ kind: "evm-wallet", origin: null, cookieMode: null, currentMode: "easy" })).toEqual({
      mode: "expert",
      writeCookie: true,
      origin: "login",
    })
  })

  it("keeps a first-time social sign-in in Easy and still writes the cookie", () => {
    expect(resolveLoginDefault({ kind: "social", origin: null, cookieMode: null, currentMode: "easy" })).toEqual({
      mode: null,
      writeCookie: true,
      origin: "login",
    })
  })

  it("never overrides the toggle", () => {
    expect(resolveLoginDefault({ kind: "evm-wallet", origin: "explicit", cookieMode: "easy", currentMode: "easy" })).toEqual({
      mode: null,
      writeCookie: false,
      origin: "explicit",
    })
  })

  it("treats a cookie from before the login default as a choice", () => {
    expect(resolveLoginDefault({ kind: "evm-wallet", origin: null, cookieMode: "easy", currentMode: "easy" })).toEqual({
      mode: null,
      writeCookie: false,
      origin: "explicit",
    })
  })

  it("follows the next sign-in while the mode is still a login default", () => {
    expect(resolveLoginDefault({ kind: "social", origin: "login", cookieMode: "expert", currentMode: "expert" })).toEqual({
      mode: "easy",
      writeCookie: true,
      origin: "login",
    })
  })

  it("does nothing new on a repeat of the same sign-in", () => {
    expect(resolveLoginDefault({ kind: "stellar-wallet", origin: "login", cookieMode: "expert", currentMode: "expert" })).toEqual({
      mode: null,
      writeCookie: false,
      origin: "login",
    })
  })
})
