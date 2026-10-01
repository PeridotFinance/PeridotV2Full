import { Callout, DocTable, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"
import { PointsCalculator } from "../widgets/PointsCalculator"

export default function PointsAndLeaderboard() {
  return (
    <>
      <Lead>
        Using Peridot earns points: every verified transaction, daily logins, badges, and referrals
        feed a season-based leaderboard. Points measure real participation; the rules below are the
        exact ones the verification pipeline applies.
      </Lead>

      <H2>Earning points per transaction</H2>
      <DocTable
        headers={["Action", "Base points", "Notes"]}
        rows={[
          ["Deposit (supply)", "20", "The core action"],
          ["Borrow", "30", "Highest base: it uses the protocol most fully"],
          ["Repay", "10", ""],
          ["Withdraw (redeem)", "5", ""],
        ]}
        caption="Mainnet values. A size bonus is added on top: from +10 (≥$100) up to +200 (≥$50,000), first matching tier."
      />
      <UL>
        <li><strong>Anti-spam rule:</strong> any transaction under $1 earns exactly 1 point, always.</li>
        <li>
          <strong>Daily throttle:</strong> your 1st–2nd transactions of the day earn full points, the
          3rd–5th half, the 6th–10th a quarter, and beyond that 10%. Volume can't be farmed by
          splitting one deposit into fifty.
        </li>
        <li><strong>Daily login:</strong> +50 points once per day, plus streak tracking for consecutive activity.</li>
        <li><strong>Verification:</strong> points are awarded after the transaction is confirmed on-chain and verified server-side; each transaction counts exactly once.</li>
      </UL>

      <PointsCalculator />

      <H2>Badges & seasons</H2>
      <P>
        Milestones (first deposit, volume thresholds, streaks) award badges, many with their own
        one-time point reward. The leaderboard runs in seasons, Season 2 spanning{" "}
        <strong>March 17 – October 31, 2026</strong>; standings archive at season end, while badges
        and profile customization persist.
      </P>

      <H2>Referrals: the Ambassador Program</H2>
      <P>
        Generate a personal invite link under <strong>Invite</strong> in the app. No cap on how many
        friends you invite.
      </P>
      <UL>
        <li>
          A referred friend must hold <strong>≥$100</strong> deposited in the Peridot Stellar markets
          for <strong>30 consecutive days</strong>.
        </li>
        <li>Once qualified, you and they each earn <strong>$5 in USDC</strong>.</li>
        <li>Balances are checked once a day; dropping below $100 restarts the count.</li>
        <li>Rewards are paid out by hand after qualifying, so allow a few days for the transfer.</li>
        <li>
          The invite page shows each friend&apos;s progress. Its older &ldquo;verified&rdquo; marker
          still means they&apos;ve transacted at least once, but no longer earns anything on its own.
        </li>
      </UL>

      <H2>One score across wallets</H2>
      <P>
        Points accrue to your Peridot account, not to a single wallet address. Link additional EVM or
        Stellar wallets to your account and their verified activity pools into one score; wallets
        created via email login are linked automatically.
      </P>

      <Callout variant="info" title="What are points for?">
        Points rank the leaderboard and unlock badges today. They are not a token and carry no
        guaranteed monetary value. If that ever changes, it will be announced explicitly, not
        retconned into these docs.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/portfolio-and-activity"
          title="Portfolio & activity"
          description="Where your verified transactions live."
        />
        <LinkCard
          href="/docs/quickstart"
          title="Quickstart"
          description="Earn your first points with your first deposit."
        />
      </LinkCardGrid>
    </>
  )
}
