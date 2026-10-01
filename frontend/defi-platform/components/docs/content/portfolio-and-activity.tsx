import { Callout, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"
import { DocFigure } from "../widgets/DocFigure"

export default function PortfolioAndActivity() {
  return (
    <>
      <Lead>
        The portfolio is your home base: what you hold, what it earns, and everything that ever
        happened to it. Easy mode shows it as a clean account view; Expert mode adds cross-chain
        detail. Both read the same positions.
      </Lead>

      <H2>The portfolio view</H2>
      <UL>
        <li><strong>Total balance</strong>: all positions valued live, with your all-time earnings called out separately.</li>
        <li><strong>Per-position detail</strong>: tap any position for its own page, showing current value, APY, accumulated interest, and actions (add more, withdraw, repay).</li>
        <li><strong>History chart</strong>: daily snapshots of your portfolio value. The chart shows real recorded history only; a new account starts with a short chart rather than an invented backfill.</li>
        <li><strong>Allocation</strong>: how your total splits across assets, at a glance.</li>
      </UL>

      <H2>Earnings, precisely</H2>
      <P>
        &ldquo;Earnings&rdquo; means interest actually accrued: current position value minus your net
        deposits into it. It updates in near-real-time because interest compounds into the pToken
        exchange rate continuously, so the number ticking up on screen is real accrual, not an
        animation.
      </P>

      <H2>Activity feed & history</H2>
      <P>
        Every deposit, withdrawal, borrow and repayment lands in the activity feed in plain language,
        grouped by date. The history view adds filters and full transaction detail.
      </P>

      <DocFigure
        src="/docs/app/easy-activity.webp"
        width={1400}
        height={468}
        alt="The recent activity list: deposits, a repayment and a borrow, each with a date, an amount and the points it earned."
        caption="Every action in plain language, with the amount and the points it earned. Sample data; your own feed shows your transactions."
      />

      <H2>Exports &amp; taxes</H2>
      <P>
        <strong>Account → Tax export</strong> downloads your full history as CSV: timestamps,
        assets, amounts, and USD values at execution time, ready for a tax tool or advisor. Interest
        is generally taxable income, so the export exists to give you (or your accountant) the raw
        record.
      </P>

      <Callout variant="info" title="One account, every device">
        Positions live on-chain and your login travels with your email; sign in from any device and
        the same portfolio is there. Nothing is stored only on one phone.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/add-and-withdraw-money"
          title="Adding & withdrawing money"
          description="Moving between your bank account and your portfolio."
        />
        <LinkCard
          href="/docs/points-and-leaderboard"
          title="Points & leaderboard"
          description="The points your activity earns along the way."
        />
      </LinkCardGrid>
    </>
  )
}
