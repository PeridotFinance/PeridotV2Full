# Privy Meld Onramp + Full Onramp/Offramp Plan

Status: **Plan for review** (no production wiring yet) · Owner: TBD · Created 2026-06-10

This plan adds an **instant card onramp** via Privy's Meld aggregator alongside the
existing Bridge.xyz SEPA flow, routes funding to the correct chain automatically,
and lays out both offramp (cash-out) routes for a later round.

---

## 1. What Privy's Meld onramp is (verified against live docs, June 2026)

Privy's "Funding Kit" exposes the **`useFiatOnramp()`** hook. **Meld is an aggregator
router** behind it — Privy routes each purchase through Meld / MoonPay / Coinbase
"based on availability and user region." You do **not** pick the provider; you pick
the destination, Privy/Meld picks the rail.

```tsx
import { useFiatOnramp } from '@privy-io/react-auth'

const { fund } = useFiatOnramp()

const result = await fund({
  source: { assets: ['usd', 'eur'], defaultAsset: 'eur' },
  destination: {
    asset: 'usdc',
    chain: 'eip155:8453',        // CAIP-2 chain id
    address: walletAddress,
  },
  environment: 'production',     // optional
  defaultAmount: '50',           // optional
})
// result.status: 'confirmed' (done) | 'submitted' (user exited before confirm)
// No onSuccess/onUserExited callbacks — branch on the returned promise.
```

- **Payment**: card / Apple Pay / Google Pay — instant. This is the value vs SEPA.
- **Fiat**: 47+ currencies incl. **EUR**.
- **Onramp only.** There is **no offramp** in `useFiatOnramp` (see §6).
- Installed SDK `@privy-io/react-auth@3.28.0` **exports `useFiatOnramp`** — verified in
  `node_modules/.../dist/dts/index.d.ts`. The interface is marked `@experimental`
  ("may change at any time") — pin the version and re-check on upgrade.

**Verified type (from the installed SDK, not docs):**

```ts
type UseFiatOnrampFundOptions = {
  source: { assets?: SupportedFiatCurrency[]; defaultAsset?: SupportedFiatCurrency }
  destination: {
    asset: string
    chain: `${string}:${string}`   // generic CAIP-2 — see note below
    address: string
  }
  environment?: FiatOnrampEnvironment
  defaultAmount?: string
}
type FundResult = { status: 'submitted' } | { status: 'confirmed' }
// SupportedFiatCurrency includes 'eur', 'usd', 'gbp', + 40 more.
```

> **Important, and good news for BSC:** `destination.chain` is typed as the generic
> CAIP-2 template `` `${string}:${string}` ``, **not** a union restricted to Base/Solana.
> So **TypeScript will happily accept `eip155:56` (BSC)** — BSC support is purely a
> *runtime Meld-provider-coverage* question, not an SDK limitation. The §3 probe is
> about whether Meld *routes* it, not whether the call compiles.

> Note: the older `useFundWallet` hook's docstring still says "external wallets and
> Moonpay" — that's the legacy single-provider funding modal. `useFiatOnramp` is the
> newer Meld-aggregator router. Use `useFiatOnramp`.

### ⚠️ Chain-support caveat (the key finding)

Privy's docs example only lists **Base (`eip155:8453`) and Solana** as onramp
destinations (asset `usdc`). **BSC and Stellar are NOT documented destinations.**

| Target | Reality | Decision |
|---|---|---|
| **BSC** (`eip155:56`, USDC/USDT) | `chain` is a generic CAIP-2 id and Meld-the-aggregator covers BNB Chain across providers, so `eip155:56` *should* route — **but unconfirmed in Privy docs**. | **Probe first** (§3), then build behind a flag. |
| **Stellar** (EURC/USDC) | Privy treats Stellar as a Tier-2 wallet abstraction (raw-sign). **No documented Meld onramp to Stellar.** | Keep **Bridge SEPA** as primary; evaluate **Stellar anchors** (Transak) as a separate instant-card option (§5). |

Sources: docs.privy.io/wallets/funding/overview · /wallets/funding/fiat-onramp ·
/wallets/overview/chains.

---

## 2. How this maps onto the current app

Already built (do not duplicate):

- **Bridge.xyz SEPA → EURC/USDC on Stellar** behind `FIAT_ONRAMP_BRIDGE`, full KYC
  state machine, `/api/bridge/*`, `lib/bridge/*`.
- **`components/onramp/AddMoneyDialog.tsx`** already splits **Card vs SEPA**. The
  Card option (`onChooseCard`) currently opens the **Squid Swapper** — a crypto-swap
  widget, *not* a real fiat card onramp. **This is the exact slot for Privy Meld.**
- **`/app/funded` → `/app/easy?deposit=<asset>&amount=<amount>`** resume flow, driven
  by `DepositResumeFromUrl`. Reused as-is by the new card path.
- Privy embedded **EVM** wallet (auto-created `users-without-wallets`) — the BSC
  onramp destination address.
- Embedded **Stellar** wallet via `signRawHash` behind `WALLET_PRIVY_STELLAR_EMBEDDED`.

Gap this plan closes: the "Card" path is fake (swap widget). Replace it with a real
card onramp that lands USDC/USDT directly on the chain of the pool being funded.

---

## 3. BSC capability probe (do this BEFORE building)

A throwaway probe to confirm Meld actually routes `eip155:56` USDC for our target
regions (DE/EU first). Run in a dev/sandbox build; do not ship.

**Probe checklist**

1. Temporary dev-only button that calls:
   ```tsx
   await fund({
     source: { assets: ['eur'], defaultAsset: 'eur' },
     destination: { asset: 'usdc', chain: 'eip155:56', address: embeddedEvmAddress },
     environment: 'sandbox',
     defaultAmount: '30',
   })
   ```
2. Confirm the Meld widget **opens with BSC + USDC pre-selected** (not an error, not a
   silent fallback to Base). Repeat with `asset: 'usdt'`.
3. Test from at least DE + one non-EU region (VPN) to gauge regional coverage, since
   Meld routes by region.
4. Record: does it confirm? which underlying provider served it? min/max amounts? fees?
5. **Decision gate**: if BSC USDC routes reliably in EU → build §4 BSC path. If it
   silently falls back or errors → ship Meld card for confirmed chains only and keep
   BSC deposits on the Bridge/Biconomy path.

Output of the probe → a short note appended to this doc (`§3 results`).

---

## 4. Onramp implementation (after probe passes)

### 4.1 Feature flags (`config/featureFlags.ts`)

```ts
// Gate the Privy Meld instant-card onramp (card/Apple/Google Pay → USDC/USDT on
// the pool's chain). Replaces the fake "Card" Swapper handoff in AddMoneyDialog.
FIAT_ONRAMP_MELD: false,            // default off until probe + QA
// Sub-gate: allow Meld card to target BSC (eip155:56). Only flip on once §3 probe
// confirms Meld routes BSC USDC/USDT in our regions.
FIAT_ONRAMP_MELD_BSC: false,
```

### 4.2 Destination routing helper (`lib/onramp/meld.ts` — new)

Single source of truth mapping a pool/asset → Meld `destination`.

```ts
// CAIP-2 ids
const CHAIN = { bsc: 'eip155:56', base: 'eip155:8453' } as const

// Returns null when the asset has no supported Meld destination (→ caller falls
// back to Bridge SEPA, e.g. anything on Stellar).
export function meldDestinationForAsset(assetId: string, evmAddress: string):
  | { asset: string; chain: string; address: string }
  | null {
  // map your data/market-data asset ids → (asset, chain)
  // e.g. 'usdc-bsc' → { asset: 'usdc', chain: CHAIN.bsc }
  //      'usdt-bsc' → { asset: 'usdt', chain: CHAIN.bsc }
  //      'usdc-base'→ { asset: 'usdc', chain: CHAIN.base }
  //      'eurc-stellar' / 'usdc-stellar' → null  (Stellar → Bridge SEPA)
}
```

Guard BSC entries behind `FIAT_ONRAMP_MELD_BSC` (return null when off).

### 4.3 Wire into `AddMoneyDialog`

- Replace the `onChooseCard` → Swapper handoff with a Meld card flow component
  `components/onramp/MeldCardOnramp.tsx` that:
  1. resolves `destination` via `meldDestinationForAsset(currentDepositAsset, embeddedEvmAddress)`,
  2. if `null` → hide/disable the Card option (or show "Card not available for this
     pool — use bank transfer"), keeping the SEPA option,
  3. else calls `fund({ source:{assets:['eur','usd'],defaultAsset:'eur'}, destination, defaultAmount })`,
  4. on `status:'confirmed'` → `router.push('/app/funded?asset=<assetId>&amount=<n>&via=card')`,
  5. on `status:'submitted'` → close quietly, no error toast.
- Keep the copy fintech-plain: **"Card · instant"** / **"Bank transfer · fee-free euros"**.
  Drop the misleading "funds EVM/Stellar" subtitles in favor of behavior-based copy;
  the destination is chosen for the user from the pool they're depositing into.

### 4.4 Destination selection logic (no chain jargon to the user)

The deposit context already knows the target pool (Easy mode auto-selects asset). Use it:

| User is depositing into | Card (Meld) lands on | Bank (Bridge) lands on |
|---|---|---|
| BSC USDC/USDT pool | USDC/USDT on **BSC** (`eip155:56`) *(flag-gated, post-probe)* | n/a → suggest card |
| Base USDC pool | USDC on **Base** | n/a |
| Stellar EURC/USDC pool | *(Meld null)* → push to SEPA, or Transak anchor (§5) | **EURC on Stellar** (SEPA, zero-FX) |

This means: BSC deposits get a true one-hop card onramp (no bridge into the hub),
Stellar deposits keep the zero-FX SEPA route. Both still resume via `/app/funded`.

### 4.5 Files touched (onramp)

- `config/featureFlags.ts` — add 2 flags.
- `lib/onramp/meld.ts` — **new** routing helper.
- `components/onramp/MeldCardOnramp.tsx` — **new** card flow (wraps `useFiatOnramp`).
- `components/onramp/AddMoneyDialog.tsx` — swap the Card branch from Swapper → Meld;
  conditionally disable when destination is `null`.
- `components/easy/EasyCardDev.tsx` — pass the active deposit asset id into the dialog
  (it likely already has it; thread it through `onChooseCard`).
- (No backend routes needed — Meld is fully client-side via Privy.)

---

## 5. Stellar instant-card option (anchors, separate from Privy)

Research result: **EURC on Stellar is supported by Transak, Ramp, and Mercuryo**;
Transak also runs **SEPA Instant** in Europe. MoonPay's documented stablecoin chains
are EVM + Solana only (no Stellar). So a *card → Stellar EURC/USDC* path exists, but
**not through Privy/Meld** — it'd be a direct Transak (or Onramper aggregator) widget.

Recommendation: **do not block on this.** Bridge SEPA is already the zero-FX EU path
for Stellar and is live. If we want an *instant* (card) Stellar option later:

- Option A: embed **Transak** widget with `cryptoCurrencyCode=USDC`/`EURC`,
  `network=stellar`, `walletAddress=<embedded Stellar address>`. One more provider
  relationship + KYC surface.
- Option B: **Onramper** aggregator (wraps Transak/Banxa/etc.) for one integration
  with broader coverage.

Both are additive and independent of the Privy work. Park as a fast-follow; keep
Stellar fiat on Bridge SEPA for now.

Sources: stellar.org anchor directory · eco.com onramp/stablecoin comparisons (2026) ·
crossmint MoonPay-vs-Transak.

---

## 6. Offramp (cash out) — both routes, plan only this round

Privy's funding hooks are **onramp-only**; there is no Meld offramp via Privy. Two
real routes, to be scoped/built in a later round:

### Route A — Bridge reverse-SEPA (EU / Stellar users) — *recommended primary*

- Bridge.xyz supports **bank payouts** (crypto → IBAN). Today `lib/bridge/payouts.ts`
  only sweeps EURC/USDC to the user's **Stellar wallet**; extend it to a **SEPA payout
  to the customer's bank**.
- Fits the existing KYC'd Bridge customer + virtual-account model — no new provider.
- New: `POST /api/bridge/offramp` (amount, currency) → Bridge payout to linked IBAN;
  reuse the `gateCustomer()` checks; add an "Cash out to bank" screen in
  `BankAccountScreen`.
- UX: "Cash out" → choose amount → funds arrive in bank (SEPA timing copy).

### Route B — Meld/Transak sell flow (BSC USDC → fiat)

- For EVM/BSC holders with no Bridge customer. **Not exposed by Privy** → standalone
  **Transak** (or Meld direct) *sell* widget: user sends BSC USDC, receives EUR to card/bank.
- Heavier: separate provider, separate KYC, widget redirect handling.

**This round: document only.** Recommend building **Route A first** (consistent with
the live EU flow, no new vendor), and treating Route B as optional for BSC parity.

---

## 7. Rollout & sequencing

1. **Probe (§3)** — dev-only, BSC USDC/USDT via Meld in EU. ~½ day. Gate decision.
2. **Onramp build (§4)** behind `FIAT_ONRAMP_MELD` (off): routing helper + MeldCard
   component + AddMoneyDialog swap. Base first (confirmed), BSC under
   `FIAT_ONRAMP_MELD_BSC` once probe passes.
3. **QA**: card → BSC pool deposit → `/app/funded` → `/app/easy` resume end-to-end;
   verify Stellar pools still route to SEPA (Meld null path).
4. **Enable** `FIAT_ONRAMP_MELD` in prod; keep `_BSC` sub-flag independent.
5. **Fast-follow (optional)**: Transak/Onramper card→Stellar (§5).
6. **Offramp round**: Bridge reverse-SEPA (Route A) → later Transak sell (Route B).

## 8. Open questions / risks

- **Meld BSC coverage is unconfirmed** — entire BSC card path hinges on §3 probe.
- **Regional routing** — Meld picks provider by region; EUR/EU is well-covered, but
  confirm min/max + fees match the audience.
- **KYC duplication** — Meld runs its own KYC (separate from Bridge's). A user could
  KYC twice if they use both card and SEPA. Acceptable; note in UX.
- **Asset id mapping** — `lib/onramp/meld.ts` must match `data/market-data.ts` ids exactly.
- **Privy SDK** — ✅ resolved: `useFiatOnramp` is present in 3.28.0; interface is
  `@experimental`, so pin the version and re-verify the `fund()` shape on any upgrade.
