import { Callout, DocTable, H2, Lead, LinkCard, LinkCardGrid, P } from "../primitives"
import { DocFigure } from "../widgets/DocFigure"

export default function NetworksAndAssets() {
  return (
    <>
      <Lead>
        Peridot's primary markets live on the Stellar network. Each market is an independent lending
        pool with its own interest-rate model and its own collateral factor, the single most
        important risk parameter for borrowers.
      </Lead>

      <H2>Stellar markets</H2>
      <DocTable
        headers={["Asset", "What it is", "Collateral factor", "Rate model"]}
        rows={[
          ["XLM", "Stellar's native asset, volatile", <strong key="x">70%</strong>, "Volatile curve (steeper, larger buffer)"],
          ["USDC", "Digital US dollar issued by Circle", <strong key="u">90%</strong>, "Stablecoin curve"],
          ["EURC", "Digital euro issued by Circle", <strong key="e">90%</strong>, "Stablecoin curve"],
        ]}
        caption="Live mainnet parameters. Collateral factor = the share of your deposit's value you can borrow against."
      />
      <P>
        The gap between 70% and 90% is deliberate: stablecoins barely move against the dollar, so
        they're safer collateral and support a higher borrowing limit. XLM can swing double-digit
        percentages in a day, so its factor leaves a wider cushion before liquidation.
      </P>

      <DocFigure
        src="/docs/app/expert-markets.webp"
        width={1400}
        height={386}
        alt="The Stellar market table showing Stellar Lumens, USD Coin and Euro Coin with their supply APY, borrow APY and total value locked."
        caption="The three Stellar markets as the app lists them. Rates move with utilization, so the figures here are a moment in time, not a quote."
      />

      <Callout variant="info" title="Boosted markets">
        Some Stellar markets offer a boosted variant, where deposits are additionally routed through
        an auto-compounding vault strategy for extra yield. Boosted markets are marked in the app
        where available. See{" "}
        <a href="/docs/apy-and-rewards">APY &amp; rewards</a>.
      </Callout>

      <H2>The multi-chain deployment</H2>
      <P>
        Alongside Stellar, Peridot operates an EVM deployment in a hub-and-spoke design: hub chains
        (led by BSC) host lending pools, while spoke chains (Arbitrum, Base, Ethereum, Polygon,
        Avalanche) let users supply into the hub without manually bridging: a gasless orchestration
        layer moves the assets. This surface targets experienced DeFi users and is available on the
        multi-chain version of the app.
      </P>

      <H2>Why Stellar first?</H2>
      <P>
        Three practical reasons: transactions settle in about five seconds, fees are fractions of a
        cent, and Stellar has first-class support for regulated fiat rails, which is what makes the
        bank-transfer-to-earning-deposit experience possible without the user ever touching a bridge
        or a gas token.
      </P>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/borrowing-and-collateral"
          title="Borrowing & collateral"
          description="How collateral factors translate into your personal borrow limit."
        />
        <LinkCard
          href="/docs/interest-rates"
          title="Interest rates"
          description="Why the stable and volatile markets use different curves."
        />
      </LinkCardGrid>
    </>
  )
}
