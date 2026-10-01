import { Callout, Formula, H2, Lead, LinkCard, LinkCardGrid, OL, P, UL } from "../primitives"
import { DocFigure } from "../widgets/DocFigure"

export default function BorrowingAndCollateral() {
  return (
    <>
      <Lead>
        Borrowing on Peridot is overcollateralized: you can only borrow against value you've already
        deposited, and always less than that value. That single constraint is what lets the protocol
        lend without credit checks, paperwork, or counterparty trust.
      </Lead>

      <H2>Why borrow against your own money?</H2>
      <UL>
        <li>
          <strong>Liquidity without selling:</strong> unlock cash from XLM or other holdings while
          keeping the upside (and the yield) of the deposit.
        </li>
        <li>
          <strong>No fixed schedule:</strong> repay any amount, any time. Interest accrues only for
          the time you actually owe.
        </li>
        <li>
          <strong>Your deposit keeps earning:</strong> collateral continues to accrue supply interest
          while it backs your loan, partially offsetting the borrow rate.
        </li>
      </UL>

      <H2>The borrow limit</H2>
      <P>
        Each asset's collateral factor caps how much of its value you can borrow against (XLM 70%,
        USDC/EURC 90%; see <a href="/docs/networks-and-assets">Networks &amp; assets</a>). Your
        limit sums over everything you've enabled as collateral:
      </P>
      <Formula
        lines={[
          "borrowLimit = Σ (deposit value × collateral factor)",
          "available   = borrowLimit − already borrowed",
        ]}
        caption="Only deposits explicitly enabled as collateral count toward the limit."
      />
      <P>
        Example: deposit $1,000 of USDC (90%) and $1,000 of XLM (70%) and your total limit is $1,600.
        The app enforces this before every borrow, and Easy mode additionally suggests staying well
        below the maximum.
      </P>

      <DocFigure
        src="/docs/app/easy-borrowing.webp"
        width={1400}
        height={428}
        alt="The borrowing panel: a borrow capacity bar reading $0.00 used of a $4,694 limit, and a No active loans state with a Start Borrowing button."
        caption="The app states the limit before you borrow anything: the bar is how much of it is used, and the figure beside it is what that collateral currently supports."
      />

      <H2>The life of a loan</H2>
      <OL>
        <li>Deposit an asset and enable it as collateral.</li>
        <li>Borrow up to your available limit in any listed asset.</li>
        <li>Interest accrues on the debt at the market's live borrow rate, block by block.</li>
        <li>Repay partially or fully whenever you like; repayment instantly restores your limit.</li>
        <li>Withdraw collateral any time, as long as the remaining limit still covers your debt.</li>
      </OL>

      <Callout variant="warning" title="The one rule that matters">
        Keep your debt below your borrow limit at all times. If prices move against you and the debt
        exceeds the limit, the position becomes eligible for liquidation. The next page covers
        exactly how that works, and how to keep a safe distance from it.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/health-factor-and-liquidation"
          title="Health factor & liquidation"
          description="The safety number, the mechanics of liquidation, and an interactive stress test."
        />
        <LinkCard
          href="/docs/interest-rates"
          title="Interest rates"
          description="How the borrow rate you pay is derived from pool utilization."
        />
      </LinkCardGrid>
    </>
  )
}
