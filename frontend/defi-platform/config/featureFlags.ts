export const FEATURE_FLAGS = {
  // Gate migration testing from AppKit to Privy without impacting prod users
  WALLET_PRIVY_EXPERIMENT: true,
  // Gate cross-chain supply flow via Axelar
  CROSS_CHAIN_SUPPLY_AXELAR: false,
  // Gate cross-chain supply flow via Biconomy Supertransactions (BSC as hub)
  CROSS_CHAIN_SUPPLY_BICONOMY: true,
  // Gate cross-chain collateral enable via Biconomy Supertransactions (BSC as hub)
  CROSS_CHAIN_COLLATERAL_BICONOMY: false,
  // Gate cross-chain borrow flow via Biconomy Supertransactions (BSC as hub)
  CROSS_CHAIN_BORROW_BICONOMY: true,
  // Gate cross-chain repay flow via Biconomy Supertransactions (BSC as hub)
  CROSS_CHAIN_REPAY_BICONOMY: false,
  // Gate cross-chain withdraw flow via Biconomy Supertransactions (BSC as hub)
  CROSS_CHAIN_WITHDRAW_BICONOMY: false,
  // Gate cross-chain USDC deposits into the Stellar markets via Circle CCTP.
  // Burn on any CCTP domain (Ethereum, Base, Arbitrum, OP, Polygon, Avalanche,
  // Unichain, Linea) -> mint on Stellar -> supply. Deliberately NOT a Biconomy
  // flow: BSC is not a CCTP domain at all, so this path never touches the hub.
  //
  // On is not the same as visible: the flow only shows where EVM wallets do,
  // i.e. v1.peridot.finance and local dev (hooks/use-cross-chain-deposit-offered).
  // And /api/cctp/plan refuses to hand out calldata unless the Stellar relayer
  // key is configured, so a deploy without STELLAR_CCTP_RELAYER_SECRET fails
  // before anyone signs a burn rather than stranding it afterwards.
  CROSS_CHAIN_DEPOSIT_CCTP: true,
  // Removed BICONOMY_CROSSCHAIN_DIALOG - now using unified TxFeedbackDialog
  // Gate lazy loading + pagination for markets table on /app
  LAZY_MARKETS_TABLE: true,
  // Gate the new cyber-styled leaderboard hero and sharing upgrades
  LEADERBOARD_2_0: true,
  // Gate interactive Level Pill in header replacing Points link
  HEADER_LEVEL_PILL: true,
  // Gate the Markets view toggle (Table/Cards) on /app
  MARKETS_VIEW_TOGGLE: true,
  // Gate simplified, creative quick transaction dropdown for new Markets cards
  MARKETS_SIMPLE_TX_DROPDOWN: true,
  // Gate Rewards HUD (Claim All) near WalletLeaderboard2 header
  REWARDS_HUD: false,
  // Gate simplified Manage Sheet (Repay/Withdraw) on cards and portfolio
  MARKETS_MANAGE_SHEET: true,
  // Gate global sci-fi Manage Dashboard accessible from Markets header
  MARKETS_MANAGE_DASHBOARD: false,
  // Gate a lightweight debug toolbar for markets UI
  MARKETS_DEBUG_TOOLBAR: false,
  // Gate interactive, live transaction feedback dialog with owl mascot
  INTERACTIVE_TX_DIALOG: true,
  // Gate throttling of transaction rewards after N transactions within 24h
  REWARDS_THROTTLE: true,
  // Gate scheduled holding daily points job and related UI
  HOLDING_DAILY_POINTS: false,
  // Gate low-frequency, visibility-aware background refresh for portfolio balances
  LIVE_MARKET_REFRESH: true,
  // Enable Privy menu smart account upgrade and routing preference
  SMART_ACCOUNT_UPGRADES: false,
  // Enable Alchemy wallet test page at /app/alchtest
  WALLET_ALCHEMY_TEST: false,
  // Gate promo banner slot replacing rewards APY rows in AssetDropdown
  MARKETS_PROMO_BANNER: true,
  // Gate tokenized stock markets display
  STOCK_MARKETS_ENABLED: false,
  // Gate supply destination chain selector (hidden until hub/spoke supports bidirectional flow)
  SHOW_SUPPLY_DESTINATION_SELECTOR: false,
  // Gate Total Market Size display on /app hero section
  SHOW_TOTAL_MARKET_SIZE: false,
  // Gate TVL Marquee display on /app hero section
  SHOW_TVL_MARQUEE: true,
  // Gate leveraged margin trading UI on Stellar testnet (XLM/USDT)
  MARGIN_TRADING_STELLAR: true,
  // Gate hybrid Bitget+Squid swap UI replacing Squid widget on /app/bridge.
  // Currently OFF — fall back to the proven Squid widget while the hybrid's
  // Bitget Order Mode path is debugged (second-signature "insufficient funds"
  // issue with sign-without-broadcast, likely gas pre-flight against an
  // unrevealed nonce reservation). Hybrid code (components/swap/*, lib/swap/*,
  // hooks/use-swap*) stays in the repo and is gated back on by flipping this.
  SWAP_BITGET_HYBRID: false,
  // Gate AI agent chat interface at /chat
  AGENT_CHAT_ENABLED: true,
  // Gate agent auto-execute for Privy embedded wallets (silent + sponsored via managed Gas Sponsorship).
  // Only takes effect if the user also opts in via agent_profiles.auto_execute_enabled.
  AGENT_AUTO_EXECUTE_EMBEDDED: true,
  // Surface DeFindex-backed boost APY on Stellar markets (USDC, EURC). When off,
  // markets render as plain lending without the boosted badge — useful as kill
  // switch if the DeFindex API or boosted vaults misbehave.
  STELLAR_BOOSTED_MARKETS: true,
  // Gate the Bridge.xyz fiat on-ramp ("Geld aufladen" via SEPA → USDC on
  // Stellar). When off, the Add-Money entry point is hidden and the
  // /api/bridge/* routes refuse work. Mainnet-only by nature.
  FIAT_ONRAMP_BRIDGE: true,
  // Deliver SEPA deposits STRAIGHT to the user's own embedded Stellar wallet
  // instead of routing them through a Bridge-managed wallet first.
  //
  // Why this exists: our Bridge PRODUCTION account is not entitled to create
  // customer-managed wallets — `POST /customers/{id}/wallets` returns 400
  // "Your account requires additional approval to create this type of wallet"
  // on every chain, while the same call succeeds in sandbox. That blocks IBAN
  // provisioning entirely, so no user can finish the on-ramp. Skipping the
  // managed wallet removes the dependency.
  //
  // VERIFIED against production 2026-07-28 — an external address IS accepted,
  // no Bridge approval needed. Two things had to change together:
  //   * rail `stellar` instead of `bridge_wallet` (the latter is the entitled one)
  //   * USDC, not EURC — `eur -> eurc @ stellar` to an external address returns
  //     "this route from source -> destination is currently not supported",
  //     while `eur -> usdc @ stellar` returns 201 with a live IBAN.
  // Bridge also requires a memo on Stellar payouts (ONRAMP_DIRECT_MEMO).
  //
  // Trade-off vs. the managed-wallet flow: EUR->USDC carries an FX spread that
  // EUR->EURC would not. That is the price of not being entitled; getting the
  // entitlement enabled would restore the 0%-FX EURC route.
  //
  // The destination needs a USDC trustline (not EURC) — established client-side
  // on provisioning.
  FIAT_ONRAMP_DIRECT_TO_WALLET: true,
  // Gate the Bridge.xyz fiat OFF-ramp ("Cash out" — EURC on the user's own
  // Stellar wallet → EUR to their own IBAN over SEPA, via a Bridge liquidation
  // address). When off, the cash-out screens are hidden and the
  // /api/bridge/offramp/* routes refuse work. Ships dark: flip on only after the
  // sandbox memo behaviour is confirmed end-to-end, since a wrong Stellar memo
  // misroutes real money. Requires FIAT_ONRAMP_BRIDGE (same customer + KYC +
  // `sepa` endorsement, which covers the rail in both directions).
  FIAT_OFFRAMP_BRIDGE: true,
  // Gate Privy-managed embedded Stellar wallets (Tier-2 raw-sign). When on,
  // logged-in users get an embedded Ed25519 Stellar wallet auto-provisioned and
  // Soroban lending txs are signed via Privy `signRawHash` instead of the
  // external Stellar Wallets Kit. Off → external-wallet (Freighter/xBull) path
  // only, unchanged. Phase A: account funded directly (no sponsored reserves /
  // fee-bump yet).
  WALLET_PRIVY_STELLAR_EMBEDDED: true,
  // THROWAWAY: Gate the Meld onramp capability probe at /app/meldtest. Dev-only
  // tool to confirm Privy/Meld actually routes BSC (eip155:56) USDC/USDT in our
  // regions before building the real card onramp. Delete this flag + the
  // /app/meldtest route + components/dev/MeldProbe.tsx once the probe is done.
  // See docs/onramp-meld-integration-plan.md §3.
  FIAT_ONRAMP_MELD_PROBE: true,
  // Gate the Privy Meld instant-card onramp (card / Apple Pay / Google Pay →
  // USDC/USDT on the pool's chain). Replaces the old Swapper card handoff
  // everywhere (AddMoneyDialog, manage-wallet, account "Add cash", Stellar
  // deposit sheet). When off, those surfaces fall back to the legacy Swapper
  // modal. See docs/onramp-meld-integration-plan.md §4.
  FIAT_ONRAMP_MELD: true,
  // Sub-gate: allow the Meld card to target BSC (eip155:56). Probe confirmed
  // BSC USDC routes on prod (June 2026), so this is on. Flip off to fall back
  // to Base-only card routing if Meld BSC coverage regresses.
  FIAT_ONRAMP_MELD_BSC: true,
  // Gate the multi-step first-run intro shown inside EasyCardDev for newly
  // logged-in users with empty wallets. Step 1 = Welcome; steps 2 (goal-setter)
  // and 3 (trust layer) ride on the same flag. Mainnet-only by intent.
  FIRST_RUN_INTRO_V2: false,
  // Gate the always-on Stellar margin TP/SL keeper. When on, users can "arm" a
  // position: the browser pre-signs a Soroban auth entry (Privy raw-hash +
  // authorizeEntry) authorizing a repay-only close up to a generous max_repay,
  // valid for ~N ledgers. A server keeper (token-gated /api/margin/keeper/run,
  // driven by the prod cron) watches the price and submits that close when TP/SL
  // crosses — even with the tab closed. NO contract change (require_auth(user) is
  // satisfied by the pre-signed entry, proven on-chain). Needs STELLAR_KEEPER_SECRET
  // + MARGIN_KEEPER_RUN_TOKEN server-side; the in-tab monitor stays the fallback.
  // Verified
  // end-to-end on testnet 2026-06-26 (UI arm → DB → keeper /run → on-chain close).
  // Requires STELLAR_KEEPER_SECRET + MARGIN_KEEPER_RUN_TOKEN + the
  // margin_keeper_arms migration + the cron driving /api/margin/keeper/run.
  MARGIN_KEEPER_ALWAYS_ON: true,
  // Gate the /app/margin trading challenges: the orange promo banner, the
  // /app/margin/challenge leaderboard + chat page, and the server scoring.
  // Dates, prize and scoring mode live in config/challenges.ts. Off until the
  // first challenge is announced — the banner reads as a live promise the
  // moment it renders.
  //
  // OFF since 2026-08-31: launch-2026-08 is over. Flipping this back on
  // restores every surface unchanged; nothing was deleted and the rows stay
  // queryable. The admin export (/api/margin-challenge/admin) is
  // deliberately NOT gated on this flag so the payout review still works.
  MARGIN_TRADING_CHALLENGES: false,
  // Register Robinhood Chain (4663) as a wallet-switchable network so the
  // NVDA/USDG isolated-margin contracts there can be read and signed against.
  // Registration only: the chain is appended to every preset (like Somnia was
  // for the old margin module) but stays out of the network switchers, has no
  // lending markets in our metadata and is not a hub. The margin UI itself
  // will get its own flag. Addresses: config/robinhood.ts, guide:
  // docs/robinhood-margin/GUIDE.md.
  ROBINHOOD_CHAIN: true,
  // The NVDA/USDG margin page at /app/margin/robinhood. On in development; in
  // production only with NEXT_PUBLIC_ROBINHOOD_MARGIN_UI=true (build-time),
  // so the page reaches users only after a real small-amount round trip
  // (deposit, open, close, withdraw) has run through it.
  // Not linked from any navigation either way.
  ROBINHOOD_MARGIN_UI:
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ROBINHOOD_MARGIN_UI === "true",
  // USDG / NVDA lending on Robinhood Chain in the Expert view: a Robinhood
  // entry in its network switcher (also on the Stellar-only host, next to
  // Stellar) that swaps the table for live on-chain Robinhood markets. The
  // selection is local to the Expert view, so Easy mode never sees it.
  // Data + flows: lib/robinhood/lending.ts, lending-flows.ts.
  ROBINHOOD_LENDING_UI: true,
  // The cross-chain engine's dev page at /app/sodax (it began as the SODAX
  // spike, hence the name). Runs deposits and withdrawals through the engine
  // (lib/crosschain, /api/crosschain/*) with real amounts. On in development;
  // in production only with NEXT_PUBLIC_SODAX_SPIKE=true. Not linked from any
  // navigation. Either this or CROSS_CHAIN_EXPERT turns the engine's server
  // side on (config/crossChainEngine.ts).
  SODAX_SPIKE:
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SODAX_SPIKE === "true",
  // Cross-chain deposits and withdrawals in the Expert view ("Pay with",
  // "Receive on"), stages X3 onwards of CROSSCHAIN_STELLAR_PLAN.md. Off in
  // production until X3 is verified with a real wallet.
  CROSS_CHAIN_EXPERT:
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_CROSS_CHAIN_EXPERT === "true",
} as const

// Three-state rollout for the account-scoped leaderboard read layer.
//   'off'       — per-wallet behavior (current production)
//   'dual-read' — both paths execute, divergences logged to PostHog, old path answers
//   'on'        — only account-scoped path answers
// Cutover: off -> dual-read -> on. Rollback at any time by flipping back to 'off'.
export const LEADERBOARD_ACCOUNT_SCOPED: 'off' | 'dual-read' | 'on' = 'on'

export type FeatureFlagName = keyof typeof FEATURE_FLAGS

 
