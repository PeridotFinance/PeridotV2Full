# Frontend handout: Robinhood NVDA/USDG margin

The mainnet contracts are deployed and both long and short directions have a
configured maximum of 5×. Use chain **4663** and
`https://rpc.mainnet.chain.robinhood.com`. Import addresses, direction mappings,
units and the 16 ABI files from [manifest.json](manifest.json). The complete
transaction flow is in [README.md](README.md).

**Operational status on 2026-09-20:** the cloud worker and durable journal are
ACTIVE, with a dedicated signer verified, execution enabled and **0.002 ETH**
funding confirmed. Fresh worker health reports **monitoring**, gasReady=true,
and no positions. Recheck health before team position tests. The selected keeper
has none of the seven checked protocol owner/admin roles. The manifest's
tradingReady flag does not attest to keeper funding, health or price availability.

| Setting | Mainnet configuration |
| --- | --- |
| Maximum leverage | `500` = 5× |
| Initial / maintenance margin | 20% / 10% |
| Maximum gross position | $2 per position |
| Maximum debt | $1 per position |
| Deposit collateral | pUSDG shares |
| USDG / NVDA / pToken decimals | 6 / 18 / 8 |
| Price and risk USD values | 18 decimals |

The caps are per position; there is no aggregate protocol cap or tester allowlist.
Read the live risk configuration and availability on every quote. Do not assume
that a 5× quote fits the debt cap. Use integer arithmetic throughout.

Both directional 5× configurations were active and opens/flash loans were
unpaused at block **68081036**. The latest read-only oracle check at block
**68118086** still returned `marketPriceable=false` for both pUSDG and pNVDA.
The funded keeper cannot currently overcome that price guard. Treat this as a dated availability snapshot;
recheck on chain before offering an action. The keeper cannot bypass oracle guards.

## Build these flows

1. Deposit: USDG approval to pUSDG → mint pUSDG → approve marginVault → deposit
   pUSDG shares. Verify share and free-margin balance changes.
2. Open: choose direction from the manifest → quote with the requested leverage
   → enforce caps and bounded fees → simulate → submit `openPosition`. Obtain the
   position ID and account from its event. Use nonzero minimum output and `0x`
   swap data for the configured adapter.
3. Manage: display debt, equity, health, oracle freshness, free margin and fees;
   support adding collateral and repayment. Short gross leverage includes the
   stable collateral and is not identical to directional stock exposure.
4. Close: quote/simulate a partial or full close; proceeds return as pTokens to
   free margin. Withdrawal and redemption to USDG are separate transactions.
5. Stale prices: surface the unavailable action clearly. Underlying repayment
   and then debt-free exit to pTokens are the tested fallback.

Read current pauses, market cash, flash capacity, `oracle.marketPriceable` and
both directional risks. Interest can move health between quotes. Always simulate
the final transaction and decode the exported errors. Maintain a receipt/event
index and reconcile uncertain submissions before offering a retry.

## Liquidation display

Show live health and a calculated estimate with its price timestamp. Liquidation
starts below health 1. Measured 5× mainnet-fork boundaries in the recorded test
were **−11.81% for the long and +12.90% for the short** from entry oracle price
222.44729849. These are historical measurements of specific small positions,
not fixed product thresholds. Fees, accrual, pool execution and exchange rates
change the result. The tiny canary debts fall below the $10 liquidation dust
threshold and are fully liquidated rather than using the ordinary 50% close.

Keep access/eligibility decisions with the operator. The deployed contracts and
frontend integration do not establish stock-token trading eligibility.
