import { Callout, H2, Lead, LinkCard, LinkCardGrid, StepList, UL } from "../primitives"
import { EarningsProjector } from "../widgets/EarningsProjector"

export default function ApyAndRewards() {
  return (
    <>
      <Lead>
        The APY on a Peridot market can stack up to three layers: base lending yield, boosted-vault
        yield on selected markets, and reward incentives. Here&apos;s each one, and how the app
        combines them into the single number you see.
      </Lead>

      <StepList
        steps={[
          {
            title: "Layer 1 · Base lending yield",
            body: (
              <>
                Borrower interest flowing into the pool, set by the{" "}
                <a href="/docs/interest-rates">jump rate model</a> and paid through the growing
                pToken exchange rate. Compounds continuously, nothing to claim, genuinely variable:
                it tracks utilization block by block.
              </>
            ),
          },
          {
            title: "Layer 2 · Boosted markets",
            body: "On selected Stellar markets, deposits also route into an auto-compounding vault that puts idle pool liquidity to work. The app marks boosted markets and folds the boost into the displayed APY. It's opt-in per market, not default, because boosted yield inherits the vault strategy's risk.",
          },
          {
            title: "Layer 3 · Reward incentives",
            body: (
              <>
                Some markets carry PERIDOT token incentives on top, streamed to suppliers or
                borrowers by pool share. Shown as a separate line so you can tell sustainable base
                yield from promotional yield. Every verified transaction also earns leaderboard{" "}
                <a href="/docs/points-and-leaderboard">points</a>, independent of any token
                incentive.
              </>
            ),
          },
        ]}
      />

      <H2>APR vs APY, honestly</H2>
      <UL>
        <li><strong>APR</strong> is the simple annualized rate the contract quotes.</li>
        <li><strong>APY</strong> includes compounding. On Peridot interest compounds automatically, so APY is what your balance actually tracks.</li>
        <li>Sub-basis-point rates display as <strong>&lt;0.01%</strong> instead of a misleading 0.00%.</li>
        <li>Charts in the app show real recorded history, not backfilled estimates; a young market shows a short chart.</li>
      </UL>

      <EarningsProjector />

      <Callout variant="info" title="Where does the yield come from?">
        Every percentage point of supply APY is paid by a borrower on the other side of the pool,
        plus, on boosted markets, by the vault strategy's returns. If a rate ever looks too good to
        be explained by those sources, that's a question worth asking of any protocol. Peridot's
        rates are derivable from the formulas in these docs.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/points-and-leaderboard"
          title="Points & leaderboard"
          description="The engagement layer on top: points, badges, seasons."
        />
        <LinkCard
          href="/docs/risks"
          title="Risks"
          description="What variable yield does and doesn't protect you from."
        />
      </LinkCardGrid>
    </>
  )
}
