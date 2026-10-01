# Robinhood mainnet margin integration

`manifest.json` exports the tested contract ABIs, chain, existing token/market
addresses, pair direction mapping and configured 5× limits. Mainnet activation
is verified: **MAINNET_5X_RISK_VERIFIED**, with live margin addresses and
`tradingReady=true`. Keep transaction buttons disabled whenever `tradingReady`
is false, and check current on-chain availability below. Never use localhost rehearsal
addresses or predicted CREATE addresses as deployed mainnet contracts.

The user-operated [deployment runner](../../deployments/robinhood-mainnet.margin-user-runner.md)
populates this manifest and refreshes these ABIs after verifying actual mainnet
activation. It does not install a keeper service; check that separately before
team positions.

The [completed 5× update](../../deployments/robinhood-mainnet.margin-5x.md) changes
risk settings only. Continue reading the live manifest and on-chain configuration;
both directions are applied and verified. The
quoter does not enforce dollar caps: size for the $1 debt/$2 gross caps and
simulate `openPosition` before requesting a signature.

## Units and state

Use integer/BigInt arithmetic. USDG has 6 decimals, NVDA 18, pTokens 8, and risk
values in USD have 18. Read token metadata on connection as an identity check.
pToken shares are not underlying units: underlying equals
`shares * exchangeRate / 1e18`. Interest can change the exchange rate. Robinhood's
RPC block height differs from native EVM block.number; do not calculate interest
from the RPC height.

The requested final configuration is active at maximum 5×, $2 gross position and
$1 debt **per position**. There is no aggregate cap or tester allowlist in this
version. Read both directional `config.getPairRisk` structs, fees, `opensPaused`,
flash pause/capacity, market cash, and `oracle.marketPriceable` rather than relying
on the manifest's intended values. Small UI limits do not restrict other callers.

## Opening a position

1. Check chain 4663, verified contract addresses, fresh margin prices and capacity.
2. If the user starts with USDG, approve **pUSDG** for the intended deposit and
   call `pUSDG.mint(usdAmount6)`. Compound-style mint returns an error code: confirm
   the Mint event and the user's share-balance increase as well as receipt success.
3. Approve **marginVault** to spend the resulting pUSDG shares, then call
   `marginVault.deposit(pUSDG, shares)`. Check `freeBalance(user, pUSDG)`.
4. Use the direction mapping in `manifest.json`. Call `quoter.quoteOpen` with
   margin **underlying** units and the requested leverage (`500` for 5×;
   above `100` and no greater than the live directional cap). Its minimum output is the
   total position underlying amount, including unswapped collateral for shorts.
   Never pass a zero minimum output. The quote is a conservative oracle estimate,
   not a guarantee of actual pool execution. Requote and simulate the actual open.
5. Calculate `maxOpeningFeePToken` using current configured fees and the quoter;
   do not assume fees remain zero. Reserve the fee in addition to margin shares.
6. Call `executor.openPosition(OpenParams)` from the user's wallet. The v4 adapter
   uses the configured pool; `swapData` is `0x` for this integration. Obtain the
   position ID and custody account from `PositionOpened`, not a predicted ID.

For long, margin and debt are pUSDG and position is pNVDA. For short, margin and
position are pUSDG and debt is pNVDA. Short gross leverage includes the stable
collateral and differs from directional stock exposure; label it accurately.

## Managing and exiting

- Read `executor.positions(id)` and `riskEngine.getMetrics(account)`. Stored
  metrics may lag interest accrual. Native RPC simulation of the transaction is
  authoritative; health is not a fixed promise about liquidation distance.
- Full close uses `executor.closePosition` with `closeBps=10000`; partial closes
  use basis points below that. Set current fee ceilings and output floors, use
  fresh simulation, and preserve the contract's slippage checks. Close proceeds
  return as pTokens to free margin, not as USDG directly to the wallet.
- Withdraw free shares with `marginVault.withdraw(pUSDG, shares)`. Redeeming
  those pTokens into USDG is a separate lending-market transaction that depends
  on available cash and market/vault conditions.
- To add collateral, first deposit shares into free margin, then call
  `executor.addCollateral(id, shares)`.
- `repayWithUnderlying` lets the executor pull debt underlying from the user
  directly into the position account; approve the executor for the bounded amount first. `repayWithPToken`
  similarly uses debt-market pTokens. Read and simulate the current debt rather
  than assuming the initial principal is sufficient.
- When prices are stale, swap-based opens/closes and liquidations can be blocked.
  Underlying repayment followed by `exitDebtFreeToPTokens` is the tested fallback.
  It returns in-kind pTokens and does not guarantee immediate underlying cash.

Track positions using indexed `PositionOpened` events filtered by owner and
subsequent executor events; persist receipt/block information and handle reorgs.
Decode the exported custom-error ABI. On uncertain submission, reconcile the
same transaction hash/nonce before prompting another submission.

## Liquidation and eligibility

Liquidation begins below health 1. The 1.25 target is soft: improved health can
be accepted below the target, and a healthy position cannot be liquidated again.
Debts at or below the engine's $10 dust threshold are fully liquidated; the tiny
canary positions are below that threshold despite a 50% ordinary close factor.

The deployment is not an eligibility determination. Being able to call a
contract, connecting from Germany, or seeing an enabled button does not by
itself establish permission to trade the stock tokens or use leverage. The
operator must resolve the applicable access policy before opening team access.

Regenerate ABI files with `python3 margin-mainnet/tools/export_frontend.py`.
The exporter intentionally refuses to overwrite a manifest containing live
margin addresses. See `deployments/robinhood-mainnet.margin.md` for the tested
deployment sequence and oracle/liquidity limitations.
