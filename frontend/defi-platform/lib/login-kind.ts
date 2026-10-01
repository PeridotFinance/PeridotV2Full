/**
 * How a visitor signed in, and which view that should open by default.
 *
 * Social or email sign-ins land in Easy: they hold nothing on chain yet and
 * fund through the bank or a card. A sign-in with an external wallet (MetaMask,
 * Rabby, Phantom, or a Stellar wallet such as Freighter) lands in Expert, where
 * funds can come from whatever network that wallet holds them on.
 *
 * Pure on purpose (no React, no "use client"), so the decision can be tested
 * without a Privy session and read by server code if it ever needs to.
 *
 * Why not `useActiveWallet().isEmbeddedWallet`: it is hard-wired to `false`
 * whenever Stellar is the active network, which is every session on the
 * Stellar-only host.
 */
import type { ViewMode } from "@/lib/view-mode"

export type LoginKind = "social" | "evm-wallet" | "stellar-wallet"

/** The fields of a Privy linked account this module looks at. */
export interface LinkedAccountLike {
  type: string
  walletClientType?: string
  connectorType?: string
}

/** Privy's own wallets: `privy` (EVM/Solana) and `privy-v2` (the tier-2 chains, Stellar among them). */
export function isEmbeddedWalletClientType(walletClientType: string | undefined): boolean {
  return walletClientType === "privy" || walletClientType === "privy-v2"
}

/** Linked account types that are wallets rather than a way to sign in. */
const WALLET_ACCOUNT_TYPES = new Set(["wallet", "smart_wallet"])

export interface LoginKindInput {
  /** Privy `authenticated`. */
  authenticated: boolean
  /** Privy `user.linkedAccounts`. */
  linkedAccounts: readonly LinkedAccountLike[] | null | undefined
  /** `useStellarWallet().source`. */
  stellarSource: "privy" | "kit" | undefined
}

/**
 * `null` means "not known yet" (still loading, or signed out), and callers must
 * not act on it.
 *
 * A Privy account that carries any non-wallet login (email, phone, passkey, an
 * OAuth provider, Telegram, …) counts as social even when an external wallet is
 * linked too: the person chose the account route at some point, and the Easy
 * view is the one that serves it. Only an account whose every entry is a wallet,
 * with at least one of them external, is a wallet sign-in. Embedded wallets never
 * decide anything: Privy creates them for every sign-in, MetaMask included.
 */
export function detectLoginKind(input: LoginKindInput): LoginKind | null {
  if (input.authenticated) {
    const accounts = input.linkedAccounts ?? []
    if (accounts.length === 0) return null
    if (accounts.some((a) => !WALLET_ACCOUNT_TYPES.has(a.type))) return "social"
    const hasExternal = accounts.some(
      (a) =>
        a.type === "wallet" &&
        typeof a.walletClientType === "string" &&
        !isEmbeddedWalletClientType(a.walletClientType) &&
        a.connectorType !== "embedded",
    )
    return hasExternal ? "evm-wallet" : null
  }
  // No Privy session: a Stellar kit wallet (Freighter, xBull, Albedo, Lobstr,
  // WalletConnect, Ledger) is the whole sign-in.
  return input.stellarSource === "kit" ? "stellar-wallet" : null
}

export function defaultViewModeFor(kind: LoginKind): ViewMode {
  return kind === "social" ? "easy" : "expert"
}

/**
 * Who set the current view mode. `explicit` is the header toggle or a `?view=`
 * link and is never overridden. `login` is this module's default and follows the
 * next sign-in, so a shared browser that goes from a MetaMask session to an
 * email session ends up in Easy again.
 */
export type ViewModeOrigin = "explicit" | "login"

export interface LoginDefaultInput {
  kind: LoginKind
  /** Stored origin, `null` when nothing is stored (or storage is unreadable). */
  origin: ViewModeOrigin | null
  /** The `peridot_view_mode` cookie as it stands, `null` when absent. */
  cookieMode: ViewMode | null
  currentMode: ViewMode
}

export interface LoginDefaultDecision {
  /** The mode to show, or `null` to leave the current one alone. */
  mode: ViewMode | null
  /** Write `mode ?? currentMode` to the cookie so the server renders it next time. */
  writeCookie: boolean
  /** Origin to store afterwards. */
  origin: ViewModeOrigin
}

export function resolveLoginDefault(input: LoginDefaultInput): LoginDefaultDecision {
  if (input.origin === "explicit") {
    return { mode: null, writeCookie: false, origin: "explicit" }
  }
  // A cookie with no stored origin predates the login default: until then only
  // the toggle and `?view=` links wrote it, so it is somebody's choice.
  if (input.origin === null && input.cookieMode !== null) {
    return { mode: null, writeCookie: false, origin: "explicit" }
  }
  const target = defaultViewModeFor(input.kind)
  return {
    mode: target === input.currentMode ? null : target,
    writeCookie: input.cookieMode !== target,
    origin: "login",
  }
}
