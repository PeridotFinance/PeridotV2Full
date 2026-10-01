# Cross-chain Borrow Flow Status (Biconomy)

## Current implementation flow

1. **Front-end entry point** – `useBorrowTransaction` determines whether to call the Biconomy path by checking the selected fee mode and feature flag. It requires EOAs on non-BSC chains to switch to BSC before proceeding and passes the detected account type (`eoa`, `eoa-7702`, or `smart-account`) together with any smart-account address or 7702 authorizations to the adapter.【F:defi-platform/hooks/use-borrow-transaction.ts†L355-L507】
2. **Compose instructions** – `biconomyAdapter.startBorrow` builds a batch of instructions: optional `enterMarkets`, the BSC `borrow(uint256)` call, and either an Axelar-style bridge intent or a transfer back to the owner when no bridge is required.【F:defi-platform/lib/biconomyAdapter.ts†L286-L384】
3. **Quote request** – The adapter always chooses the borrowed underlying token as both the funding token and the fee token, sets `maxAvailableFunds`, and asks Biconomy for a sponsored quote first. If sponsorship is denied, it retries in fallback mode with the same token and expects the user to fund an on-chain transaction on BSC.【F:defi-platform/lib/biconomyAdapter.ts†L460-L598】
4. **Signature handling** – All signable payloads from the quote are looped through. EIP-712 payloads are signed, message payloads call `signMessage`, and raw transaction payloads trigger `sendTransaction` on the connected wallet (only allowed for EOAs). Smart-account modes abort when a raw transaction payload is returned.【F:defi-platform/lib/biconomyAdapter.ts†L640-L756】
5. **Execution** – The signed payload array is sent back to `/api/biconomy/execute`. On success we surface the resulting super-transaction hash, fee metadata, and status tracking URL.【F:defi-platform/lib/biconomyAdapter.ts†L760-L828】

## Why EOA cross-chain borrow is blocked today

* **Fee token deadlock** – Because we always nominate the borrowed underlying as the fee token, the user is asked to pay in a token they do not hold yet on BSC. Sponsored quotes therefore fail, and the fallback path requests an on-chain transfer of the same token, which cannot succeed for a fresh borrower.【F:defi-platform/lib/biconomyAdapter.ts†L460-L625】
* **Fallback requires on-chain funding** – When sponsorship fails we prompt the wallet to broadcast a BSC transaction that spends the underlying token. EOAs without an existing BSC balance simply hit `BICONOMY_ONCHAIN_FUNDING_TX_FAILED`, so the borrow never reaches execution.【F:defi-platform/lib/biconomyAdapter.ts†L704-L743】
* **No alternative fee token selection** – We do not expose a `feeTokenOverride`, so we cannot request the “two-signature” path that lets the user sign a permit for another token (e.g. USDC) and a separate borrow payload. Biconomy never has a viable funding source to work with under the current parameters.【F:defi-platform/lib/biconomyAdapter.ts†L286-L507】【F:defi-platform/lib/biconomyAdapter.ts†L460-L598】

To unblock EOAs we need to:

1. Allow the front end to choose or infer a different funding/fee token (e.g. a stable the user already holds) before calling `startBorrow`, mirroring what we do for supply.
2. Pass that override into the adapter so the quote response returns multiple payloads (permit + execution) that we can already sign in sequence.
3. Ensure the UI messaging prepares the user for two signature prompts and make sure we store any approvals needed for the chosen funding token.

## Why smart-account borrow is blocked today

* **Sponsorship is mandatory but unavailable** – We throw `BICONOMY_SMART_ACCOUNT_REQUIRES_SPONSORSHIP` as soon as the sponsored quote falls back, because smart accounts have no concept of self-funding a BSC transaction. With the fee token fixed to the borrowed asset, sponsorship keeps failing and we exit early.【F:defi-platform/lib/biconomyAdapter.ts†L319-L582】
* **Raw payloads are unsupported** – Even if Biconomy were to hand back a raw transaction for funding, our smart-account mode deliberately aborts when such a payload appears. Without a sponsored quote in a token the aggregator can draw from, smart accounts cannot progress past the quote phase.【F:defi-platform/lib/biconomyAdapter.ts†L704-L712】

To support smart accounts we must:

1. Detect their presence (already in place via `useAccountType`/`useSmartAccountStatus`) and feed a viable fee token when requesting the quote so Biconomy can keep the flow fully sponsored.【F:defi-platform/hooks/use-borrow-transaction.ts†L60-L109】【F:defi-platform/lib/biconomyAdapter.ts†L460-L598】
2. Confirm that Biconomy can sponsor the borrow with that token (or configure project-side sponsorship budgets) so no fallback path is triggered.
3. Keep rejecting raw payloads for smart accounts, but log and surface actionable errors if sponsorship still fails, so we know when configuration—not code—is blocking the user.

## Summary of gaps to close

* Add fee-token selection for borrows (front end + adapter) to avoid charging users in the asset they are trying to borrow.
* Handle the resulting multi-payload signature UX for EOAs, informing the user they must sign both the funding approval and the borrow execution.
* Provide or configure a sponsorship-compatible fee path for smart accounts so they never fall back to an impossible on-chain funding step.
* Keep the existing supply flow untouched; it already performs its own funding-token selection and succeeds across account types.
