/**
 * data/help-catalog.ts
 *
 * Single source of truth for the public App Handbook (`/guide`).
 *
 * Every entry describes one screenshot-able UI state of the `/app`. The same
 * file drives BOTH:
 *   1. the capture harness (`scripts/help-shots/capture.ts`), which reads
 *      `setup` to navigate + force the state, then writes PNGs, and
 *   2. the handbook page (`app/guide/*`), which reads `title`, `blurb`,
 *      `hotspots` and the generated manifest to render the annotated catalog.
 *
 * Keeping capture and display in one definition means the screenshots and the
 * explanations can never drift apart; regenerate with `pnpm shots`.
 *
 * Pure TypeScript (no Node/Playwright imports) so the client bundle can import
 * it directly.
 */

export type Viewport = "desktop" | "mobile"

export type HelpCategoryId =
  | "getting-started"
  | "easy"
  | "expert"
  | "wallet"
  | "actions"
  | "sheets"

/** Navigation groups, in display order. Drives the handbook sidebar. */
export interface HelpCategory {
  id: HelpCategoryId
  label: string
  /** One-line description shown under the category heading. */
  blurb: string
  /** lucide-react icon name, resolved on the page. */
  icon: string
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    blurb: "Signing in, demo mode, and switching between Easy and Expert.",
    icon: "Compass",
  },
  {
    id: "easy",
    label: "Easy Mode",
    blurb: "The guided experience: deposit, portfolio, activity, account.",
    icon: "Sparkles",
  },
  {
    id: "expert",
    label: "Expert Mode",
    blurb: "The market table, network selector, and detailed metrics.",
    icon: "LineChart",
  },
  {
    id: "wallet",
    label: "Manage Wallet",
    blurb: "Connect, addresses, send / receive, disconnect.",
    icon: "Wallet",
  },
  {
    id: "actions",
    label: "Actions & States",
    blurb: "What people see while waiting, on success, and on errors.",
    icon: "Activity",
  },
  {
    id: "sheets",
    label: "Sheets & Notifications",
    blurb: "The input sheets and the toast notifications.",
    icon: "Layers",
  },
]

/** A clickable annotation overlaid on a screenshot. Coordinates are percentages
 *  (0–100) relative to the rendered image, so they survive any DPR/resize. */
export interface HelpHotspot {
  x: number
  y: number
  label: string
}

/** One DOM CustomEvent the harness dispatches to force a transient state.
 *  These mirror the real `peridot:tx-*` lifecycle the app already emits, so the
 *  captured UI is exactly what a user would see, with no mock components. */
export interface HelpDomEvent {
  name:
    | "peridot:tx-active"
    | "peridot:tx-update"
    | "peridot:tx-success"
    | "peridot:tx-idle"
    | "peridot:tx-deposit-meta"
  detail?: Record<string, unknown>
  /** Pause after dispatching this event before the next one (ms). */
  afterMs?: number
}

/** A click the harness performs after load, to open a sheet, dismiss a
 *  blocking modal, switch a tab, etc. Selector is Playwright syntax
 *  (`text="…"`, `[data-testid="…"]`, CSS). */
export interface HelpClick {
  selector: string
  /** Pause after the click (ms). */
  afterMs?: number
  /** A missing target is not an error (e.g. a modal that may not appear). */
  optional?: boolean
}

export interface HelpEntrySetup {
  /** Path to open, relative to base URL. `?e2e=1` (demo mode) is appended
   *  automatically by the harness unless the route already sets an `e2e`
   *  param (use `?e2e=0` to capture the real, non-demo state). */
  route: string
  /** Optional selector to await before acting/capturing. */
  waitFor?: string
  /** Clicks performed after load, before events. */
  clicks?: HelpClick[]
  /** Events dispatched in order to drive the UI into a transient state. */
  events?: HelpDomEvent[]
  /** CSS selectors hidden right before the screenshot, e.g. a competing
   *  global overlay so a single component is documented cleanly. */
  hideSelectors?: string[]
  /** Capture the full scrollable page instead of just the viewport. */
  fullPage?: boolean
  /** Extra settle time before the screenshot (ms). Defaults per harness. */
  settleMs?: number
  /** Requires a real logged-in session (not demo mode). Skipped by normal runs;
   *  captured only via `pnpm shots --session`, which opens a headed browser
   *  with a persistent profile for a one-time manual login. */
  needsSession?: boolean
}

export interface HelpEntry {
  /** Stable kebab-case id. Used for the PNG filename + manifest key. */
  key: string
  category: HelpCategoryId
  title: string
  /** Short plain-language explanation of what this state is / when it appears. */
  blurb: string
  /** Which device frames to capture + show. */
  viewports: Viewport[]
  setup: HelpEntrySetup
  /** Optional annotated hotspots, per viewport. Authored after first capture. */
  hotspots?: Partial<Record<Viewport, HelpHotspot[]>>
}

// Shared demo numbers so the success state reads like a real deposit.
const DEMO_DEPOSIT_META = { usd: 250, apy: 8.4, symbol: "USDC" }
// Dismiss the Stellar "first time" sheet that auto-opens on first Expert load.
const DISMISS_STELLAR_INTRO: HelpClick = { selector: 'text="Maybe later"', optional: true, afterMs: 500 }

export const HELP_CATALOG: HelpEntry[] = [
  // ── Getting Started ───────────────────────────────────────────────────────
  {
    key: "login-screen",
    category: "getting-started",
    title: "Sign in",
    blurb:
      "The first screen for a new visitor on mobile. They can sign in with email or social login, or continue in a no-wallet preview.",
    viewports: ["mobile"],
    setup: { route: "/app?e2e=0", waitFor: 'text="Sign in to get started"', settleMs: 600 },
  },
  {
    key: "connect-chooser",
    category: "getting-started",
    title: "Connect wallet: chooser",
    blurb:
      "When someone first enters a Stellar market, this sheet offers a one-tap login (wallet created automatically) or connecting their own Stellar wallet.",
    viewports: ["mobile", "desktop"],
    setup: { route: "/app?view=expert", waitFor: 'text="Start earning on Stellar"', settleMs: 500 },
  },

  // ── Easy Mode ─────────────────────────────────────────────────────────────
  {
    key: "easy-deposit-idle",
    category: "easy",
    title: "Deposit: home",
    blurb:
      "The main Easy Mode card. People pick an amount and deposit to start earning interest, with no crypto jargon.",
    viewports: ["mobile", "desktop"],
    setup: { route: "/app" },
  },
  {
    key: "easy-portfolio",
    category: "easy",
    title: "Portfolio",
    blurb:
      "A clear view of total savings and each position, with a value chart and the interest earned over time.",
    viewports: ["mobile", "desktop"],
    setup: { route: "/app/easy/portfolio", waitFor: 'text="Your Savings"', settleMs: 600 },
  },
  {
    key: "easy-account",
    category: "easy",
    title: "Account & settings",
    blurb:
      "Everything in one place: add cash, copy a referral code, manage wallets, switch theme, and sign out.",
    viewports: ["mobile", "desktop"],
    setup: { route: "/app/easy/account", waitFor: 'text="Account"', settleMs: 600 },
  },

  // ── Expert Mode ───────────────────────────────────────────────────────────
  {
    key: "expert-markets",
    category: "expert",
    title: "Markets: overview",
    blurb:
      "The Expert view lists every market with supply / borrow rates and TVL per network, for people who want the detail.",
    viewports: ["mobile", "desktop"],
    setup: {
      route: "/app?view=expert",
      clicks: [DISMISS_STELLAR_INTRO],
      waitFor: '[data-testid="market-table"]',
      settleMs: 500,
    },
  },
  {
    key: "expert-network-switcher",
    category: "expert",
    title: "Network selector",
    blurb:
      "Switch the active network to view its markets. Hub chains host the pools; spokes provide cross-chain access.",
    viewports: ["desktop"],
    setup: {
      route: "/app?view=expert",
      waitFor: '[data-testid="network-switcher"]',
      clicks: [DISMISS_STELLAR_INTRO, { selector: '[data-testid="network-switcher"]', afterMs: 700 }],
      settleMs: 400,
    },
  },

  // ── Actions & States (the owl confirmation dialog) ────────────────────────
  {
    key: "action-waiting",
    category: "actions",
    title: "Waiting for confirmation",
    blurb:
      "Right after starting a deposit. The app waits for confirmation; with an embedded wallet this is an in-app prompt, not an external wallet app.",
    viewports: ["mobile", "desktop"],
    setup: { route: "/app", events: [{ name: "peridot:tx-active" }], settleMs: 900 },
  },
  {
    key: "action-success",
    category: "actions",
    title: "Success",
    blurb:
      "The deposit is confirmed. A short celebration names the amount and rate, awards points, and clears itself after a few seconds.",
    viewports: ["mobile", "desktop"],
    setup: {
      route: "/app",
      events: [
        { name: "peridot:tx-active", afterMs: 150 },
        { name: "peridot:tx-deposit-meta", detail: DEMO_DEPOSIT_META, afterMs: 100 },
        { name: "peridot:tx-success" },
      ],
      settleMs: 600,
    },
  },
  {
    key: "action-error-insufficient",
    category: "actions",
    title: "Not enough balance",
    blurb:
      "When the balance can't cover the deposit plus the network fee. The dialog explains it and offers a retry or a way to add funds.",
    viewports: ["mobile", "desktop"],
    setup: {
      route: "/app",
      events: [
        { name: "peridot:tx-active", afterMs: 150 },
        // `error` triggers the error branch; `insufficient balance` selects the
        // funds-specific copy + the add-funds path.
        { name: "peridot:tx-update", detail: { step: "error", statusMessage: "insufficient balance for network fees" } },
      ],
      settleMs: 700,
    },
  },

  // ── Manage Wallet (real session required: `pnpm shots --session`) ─────────
  {
    key: "wallet-manage",
    category: "wallet",
    title: "Manage wallet",
    blurb:
      "The profile pill opens the wallet hub: connected wallets, addresses and balances across chains. Copy, manage or disconnect, all here.",
    viewports: ["desktop"],
    setup: {
      route: "/app/easy/portfolio",
      needsSession: true,
      waitFor: '[data-testid="wallet-pill"]',
      clicks: [{ selector: '[data-testid="wallet-pill"]', afterMs: 1000 }],
      settleMs: 700,
    },
  },
  {
    key: "wallet-receive",
    category: "wallet",
    title: "Receive",
    blurb:
      "The receive sheet shows a QR code and the wallet address for topping up; one tap to copy.",
    viewports: ["desktop"],
    setup: {
      route: "/app/easy/portfolio",
      needsSession: true,
      waitFor: '[data-testid="wallet-pill"]',
      clicks: [
        { selector: '[data-testid="wallet-pill"]', afterMs: 800 },
        { selector: 'text="Receive"', afterMs: 900 },
      ],
      settleMs: 600,
    },
  },
  {
    key: "wallet-send",
    category: "wallet",
    title: "Send",
    blurb:
      "The send sheet: choose a token, enter a destination address and amount, and review before sending.",
    viewports: ["desktop"],
    setup: {
      route: "/app/easy/portfolio",
      needsSession: true,
      waitFor: '[data-testid="wallet-pill"]',
      clicks: [
        { selector: '[data-testid="wallet-pill"]', afterMs: 800 },
        { selector: 'text="Send"', afterMs: 900 },
      ],
      settleMs: 600,
    },
  },

  // ── Sheets & Notifications ────────────────────────────────────────────────
  {
    key: "toast-pending-desktop",
    category: "sheets",
    title: "Transaction toast (desktop)",
    blurb:
      "On desktop, progress shows as a compact toast in the corner instead of a full dialog, unobtrusive while a transaction settles.",
    viewports: ["desktop"],
    setup: {
      route: "/app/easy/portfolio",
      waitFor: 'text="Your Savings"',
      events: [
        { name: "peridot:tx-active", afterMs: 250 },
        { name: "peridot:tx-update", detail: { step: "Supplying", statusMessage: "Confirming your deposit" } },
      ],
      settleMs: 900,
    },
  },
  {
    key: "sheet-deposit",
    category: "sheets",
    title: "Deposit sheet",
    blurb:
      "The deposit input sheet (a bottom sheet on mobile, a side drawer on desktop): choose an amount, review the rate, and confirm.",
    viewports: ["desktop"],
    setup: {
      route: "/app",
      waitFor: '[data-testid="steallar-page"]',
      // Asset rows live in collapsed sections: expand them, then open the sheet.
      clicks: [
        { selector: '[data-testid="section-toggle-Currencies"]', optional: true, afterMs: 350 },
        { selector: '[data-testid="section-toggle-Cryptocurrencies"]', optional: true, afterMs: 350 },
        { selector: '[data-testid^="deposit-btn-"]', afterMs: 1000 },
      ],
      settleMs: 500,
    },
  },
  {
    key: "sheet-withdraw",
    category: "sheets",
    title: "Withdraw sheet",
    blurb:
      "The withdraw sheet mirrors deposit: pick an amount from an existing position and confirm. Withdraw anytime, no lock-up.",
    viewports: ["desktop"],
    setup: {
      route: "/app",
      waitFor: '[data-testid="steallar-page"]',
      clicks: [
        { selector: '[data-testid="section-toggle-Currencies"]', optional: true, afterMs: 350 },
        { selector: '[data-testid="section-toggle-Cryptocurrencies"]', optional: true, afterMs: 350 },
        { selector: '[data-testid^="withdraw-btn-"]', afterMs: 1000 },
      ],
      settleMs: 500,
    },
  },
]
