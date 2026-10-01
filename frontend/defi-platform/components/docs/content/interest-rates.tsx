import { Callout, Code, Formula, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"
import { RateCurveExplorer } from "../widgets/RateCurveExplorer"

export default function InterestRates() {
  return (
    <>
      <Lead>
        No committee sets Peridot's rates. Every market prices itself from a single input,{" "}
        <strong>utilization</strong> (the share of the pool currently lent out), through a curve
        called the jump rate model. This page walks through the exact math the contracts run on
        every block.
      </Lead>

      <H2>Utilization</H2>
      <Formula
        lines={["utilization = totalBorrows / (cash + totalBorrows)"]}
        caption="cash = liquidity sitting in the pool; totalBorrows = everything currently lent out."
      />
      <P>
        Utilization is the market's supply-and-demand gauge. Low utilization means idle liquidity:
        rates fall to attract borrowers. High utilization means the pool is nearly drained: rates
        rise sharply to attract deposits and encourage repayment, protecting withdrawals.
      </P>

      <H2>The jump rate model</H2>
      <P>
        The borrow rate follows utilization along two straight lines that meet at the{" "}
        <strong>kink</strong> (typically 80%). Below the kink, rates climb gently; above it, the
        slope jumps steeply, and that jump is the pool's self-defense against running out of liquidity:
      </P>
      <Formula
        lines={[
          "u ≤ kink:   borrowRate = base + u × multiplier",
          "u > kink:   borrowRate = base + kink × multiplier",
          "                        + (u − kink) × jumpMultiplier",
        ]}
      />
      <P>
        Suppliers earn the borrow rate scaled by two factors: only the utilized share of the pool
        earns interest, and a slice (the <strong>reserve factor</strong>) accrues to protocol
        reserves as an insurance buffer:
      </P>
      <Formula
        lines={["supplyRate = borrowRate × utilization × (1 − reserveFactor)"]}
        caption="This identity guarantees interest paid in ≥ interest paid out; the pool can't promise yield it isn't earning."
      />

      <RateCurveExplorer />

      <H2>Two curves, two asset classes</H2>
      <UL>
        <li>
          <strong>Stablecoin markets (USDC, EURC)</strong> use a flatter curve: demand for dollar
          liquidity is steady, so rates stay in a narrow, predictable band below the kink.
        </li>
        <li>
          <strong>Volatile markets (XLM)</strong> use a steeper curve with a harsher jump: when a
          volatile asset's pool drains fast, the model reacts fast.
        </li>
      </UL>

      <H2>From per-block rate to APY</H2>
      <P>
        On-chain, the model quotes a rate per block (per ledger on Stellar). The app annualizes it,
        and the compounding of the exchange rate turns the annual rate (APR) into the slightly higher
        APY you see displayed:
      </P>
      <Formula
        lines={["APR = ratePerBlock × blocksPerYear", "APY ≈ (1 + APR/n)ⁿ − 1   for n compounding periods"]}
        caption="Rates below one basis point display as “<0.01%” rather than rounding to zero."
      />

      <Callout variant="info" title="Rates are variable by design">
        Your APY changes whenever anyone deposits, withdraws, borrows, or repays; that's the
        mechanism working, not a malfunction. Large moves in either direction pull the rate back
        toward equilibrium: high rates attract deposits, which lowers utilization, which lowers rates.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/apy-and-rewards"
          title="APY & rewards"
          description="How displayed APY combines base yield, boosts and rewards."
        />
        <LinkCard
          href="/docs/health-factor-and-liquidation"
          title="Health factor & liquidation"
          description="The other side of borrowing: what keeps loans solvent."
        />
      </LinkCardGrid>
    </>
  )
}
