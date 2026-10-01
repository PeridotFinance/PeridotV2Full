import { Callout, DocTable, Formula, H2, Lead, LinkCard, LinkCardGrid, OL, P } from "../primitives"
import { MarginLiquidationCalculator } from "../widgets/MarginLiquidationCalculator"

export default function MarginTrading() {
  return (
    <>
      <Callout variant="warning" title="Testnet product">
        Margin trading currently runs on the Stellar testnet with test funds, isolated from mainnet
        lending. The mechanics documented here are live on-chain; parameters may still change before
        a mainnet release. A built-in paper-trading mode lets you practice with zero risk.
      </Callout>

      <Lead>
        Margin trading lets you open a leveraged long or short on XLM against USDT margin: the
        protocol lends you the difference between your margin and the position size, using the same
        lending pools documented elsewhere in these docs, with a dedicated risk engine on top.
      </Lead>

      <H2>Position sizing</H2>
      <Formula
        lines={[
          "positionSize = margin × leverage          (leverage: 2×–5×)",
          "borrowed     = margin × (leverage − 1)",
        ]}
        caption="A Long borrows USDT and swaps it into XLM; a Short borrows XLM and swaps it into USDT."
      />
      <P>
        Nothing is ever paid into your wallet: the borrow and the swap happen inside the protocol,
        and the resulting position is held by the margin controller as collateral for the debt.
      </P>

      <H2>Opening and closing</H2>
      <P>
        An open is a three-step on-chain sequence behind a single button: reserve the position, swap
        through the on-chain liquidity pool, activate. Closes run the sequence in reverse. The swap
        back happens on-chain too, so you never need the debt asset in your wallet to close. If a
        sequence is interrupted, the app offers resume or cancel; unfinished opens expire after 30
        minutes and release their funds.
      </P>

      <H2>Liquidation math</H2>
      <P>
        Margin positions use maintenance-margin logic (not the lending collateral factors): a
        position is liquidatable when its value, discounted by the 5% maintenance margin, no longer
        covers the debt.
      </P>
      <Formula
        lines={[
          "liquidatable when: positionValue × (1 − 0.05) < debtValue",
          "",
          "Long:  liqPrice = entry × (lev − 1) / (lev × 0.95)",
          "Short: liqPrice = entry × 0.95 × lev / (lev − 1)",
        ]}
        caption="At-entry closed forms; accrued borrow interest shifts the real threshold over time. On-chain health is authoritative."
      />

      <MarginLiquidationCalculator />

      <H2>Protections & parameters</H2>
      <DocTable
        headers={["Parameter", "Value", "What it does"]}
        rows={[
          ["Minimum open health", "1.10", "Positions can't be opened already near liquidation"],
          ["Maintenance margin", "5%", "The buffer that defines the liquidation threshold"],
          ["Liquidation incentive", "1%", "Bonus paid to liquidators for closing unhealthy positions"],
          ["Max slippage (oracle band)", "5%", "Opens are rejected if the pool price strays >5% from the oracle price"],
          ["Leverage", "2×–5×", "Integer steps"],
          ["Open/close fees", "0 (testnet)", "Borrow interest still accrues and is folded into PnL"],
        ]}
      />
      <P>
        The oracle band deserves emphasis: if the on-chain liquidity pool's price drifts more than 5%
        from the independent oracle price, opens are blocked entirely, and no slippage setting can
        override it. This protects you from opening into a manipulated or thin market, at the cost of
        occasionally having to wait out a drift.
      </P>

      <H2>Take-profit & stop-loss</H2>
      <OL>
        <li>Set independent TP and SL trigger prices on any open position, with live PnL preview.</li>
        <li>While the app is open, a client-side monitor watches the mark price and executes your triggers.</li>
        <li>An always-on server keeper can arm triggers that fire even with the app closed.</li>
      </OL>

      <Callout variant="info" title="PnL is net of interest">
        The PnL you see already subtracts accrued borrow interest: the number on screen is what
        you'd actually realize on close, not a gross figure with costs hidden elsewhere.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/health-factor-and-liquidation"
          title="Health factor & liquidation"
          description="The lending-side risk model, for contrast with maintenance margin."
        />
        <LinkCard
          href="/docs/risks"
          title="Risks"
          description="Leverage amplifies every risk on this list."
        />
      </LinkCardGrid>
    </>
  )
}
