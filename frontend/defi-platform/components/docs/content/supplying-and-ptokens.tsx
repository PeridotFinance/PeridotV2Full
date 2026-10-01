import { Callout, Code, Formula, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"

export default function SupplyingAndPTokens() {
  return (
    <>
      <Lead>
        When you deposit into a Peridot market you receive <strong>pTokens</strong>, a receipt for
        your share of the pool. You don't earn interest as separate payouts; instead, the receipt
        itself becomes redeemable for more and more of the underlying asset. This page explains that
        mechanism, because everything else (APY, withdrawals, collateral) builds on it.
      </Lead>

      <H2>The exchange rate</H2>
      <P>
        Each market tracks one number that ties pTokens to the underlying asset: the exchange rate.
        On deposit you get <Code>amount / exchangeRate</Code> pTokens; on withdrawal each pToken pays
        out at the current rate:
      </P>
      <Formula
        lines={[
          "underlying = pTokens × exchangeRate",
          "",
          "exchangeRate = (cash + totalBorrows − reserves) / totalPTokenSupply",
        ]}
        caption="On Stellar the rate is scaled by 1e6; on the EVM deployment by 1e18. The app hides both."
      />
      <P>
        As borrowers pay interest into the pool, <Code>totalBorrows</Code> grows, so the exchange
        rate (and with it the value of every pToken) only ever moves up. Your pToken count stays
        constant while you hold; your claim on the pool grows underneath it.
      </P>

      <H2>A worked example</H2>
      <UL>
        <li>You deposit 1,000 USDC when the exchange rate is 1.0200 → you receive ~980.39 pUSDC.</li>
        <li>Over the year, borrower interest lifts the exchange rate to 1.0710.</li>
        <li>Your 980.39 pUSDC now redeem for 980.39 × 1.0710 ≈ <strong>1,050 USDC</strong>: a 5% yield, delivered entirely through the rate.</li>
      </UL>

      <H2>Why a receipt token at all?</H2>
      <UL>
        <li><strong>Continuous interest</strong>: accrual happens every block, with no payout schedule and nothing to claim or reinvest.</li>
        <li><strong>Instant, partial withdrawals</strong>: redeem any fraction of your pTokens at any time, as long as the pool has liquidity.</li>
        <li><strong>Collateral</strong>: the same pTokens double as collateral when you borrow, without interrupting the interest they earn.</li>
      </UL>

      <Callout variant="info" title="What you see in the app">
        The app never shows pTokens or exchange rates; it shows your balance in the asset you
        deposited, already converted at the live rate. Expert mode's market details expose the raw
        numbers for those who want them.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/interest-rates"
          title="Interest rates"
          description="What moves the exchange rate: the jump rate model, interactively."
        />
        <LinkCard
          href="/docs/borrowing-and-collateral"
          title="Borrowing & collateral"
          description="Using your deposit as collateral without giving up its yield."
        />
      </LinkCardGrid>
    </>
  )
}
