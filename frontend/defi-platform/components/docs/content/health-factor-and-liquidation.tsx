import { Callout, Formula, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"
import { HealthFactorSimulator } from "../widgets/HealthFactorSimulator"

export default function HealthFactorAndLiquidation() {
  return (
    <>
      <Lead>
        Every borrowing position has one number that summarizes its safety: the{" "}
        <strong>health factor</strong>. Above 1.0 your position is safe; at 1.0 it becomes eligible
        for liquidation. Understanding this number, and keeping a comfortable distance from 1.0, is
        the whole art of borrowing safely.
      </Lead>

      <H2>The health factor</H2>
      <Formula
        lines={[
          "healthFactor = borrowLimit / borrowedValue",
          "             = Σ(collateral × collateralFactor) / debt",
        ]}
        caption="HF 2.0 = you're using half your limit. HF 1.1 = a 9% adverse move wipes your buffer."
      />
      <P>
        Two things move it: <strong>prices</strong> (your collateral falling or your borrowed asset
        rising) and <strong>interest</strong> (debt grows slowly as borrow interest accrues). Repaying
        debt or adding collateral pushes it back up, immediately.
      </P>

      <HealthFactorSimulator />

      <H2>What liquidation actually does</H2>
      <P>
        If the health factor reaches 1.0, anyone may repay a portion of the position's debt and
        receive a matching slice of its collateral, plus a small bonus (the liquidation incentive)
        that makes doing so worthwhile. The point is not punishment: it's that the pool's depositors
        must never be left holding an underwater loan. Liquidation trims the position back to
        solvency; it doesn't seize everything.
      </P>

      <H2>Staying safe in practice</H2>
      <UL>
        <li><strong>Borrow stable against stable</strong>: USDC collateral for a USDC-denominated need has almost no price risk.</li>
        <li><strong>Leave headroom on volatile collateral</strong>: with XLM, using under half your limit means roughly a 50% price crash is needed before trouble.</li>
        <li><strong>Watch the meter</strong>: the app shows your health prominently and colors it long before it's critical.</li>
        <li><strong>React early</strong>: a small repayment at HF 1.3 is far cheaper than a liquidation at 1.0.</li>
      </UL>

      <Callout variant="warning" title="Interest alone can liquidate, eventually">
        Even with rock-stable prices, borrow interest compounds against you. A position parked just
        above its limit and forgotten will drift below 1.0 given enough time. Check in on open loans.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/risks"
          title="Risks"
          description="Liquidation in context: the full, honest risk picture."
        />
        <LinkCard
          href="/docs/portfolio-and-activity"
          title="Portfolio & activity"
          description="Where the app surfaces your health factor and position details."
        />
      </LinkCardGrid>
    </>
  )
}
