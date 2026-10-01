import { Callout, DocTable, H2, Lead, P } from "../primitives"
import { DocFigure } from "../widgets/DocFigure"

export default function EasyAndExpertMode() {
  return (
    <>
      <Lead>
        The app has two faces on the same account and the same money: <strong>Easy mode</strong>, a
        clean savings experience, and <strong>Expert mode</strong>, the full market console. Switch
        any time with the toggle in the header: nothing about your positions changes, only how much
        the interface shows you.
      </Lead>

      <H2>The same money, two ways</H2>
      <DocFigure
        src="/docs/app/easy-markets.webp"
        width={1400}
        height={366}
        alt="Easy mode: a list with US Dollar at 6.5% and Euro at 1.0%, each with a Deposit button, and cryptocurrencies collapsed below."
        caption="Easy mode names what you would call it at a bank: US Dollar, Euro, an interest rate, a Deposit button. The crypto is still there, folded away under Cryptocurrencies."
      />
      <DocFigure
        src="/docs/app/expert-markets.webp"
        width={1400}
        height={386}
        alt="Expert mode: a market table listing Stellar Lumens, USD Coin and Euro Coin with supply APY, borrow APY and TVL per market."
        caption="Expert mode shows the same three markets as a table: supply and borrow rates side by side, total value locked, and a row that opens the full market detail."
      />

      <H2>What each mode shows</H2>
      <DocTable
        headers={["", "Easy mode", "Expert mode"]}
        rows={[
          ["Language", "Plain money terms: deposit, withdraw, earn", "Protocol terms: supply, redeem, utilization, collateral factor"],
          ["Home screen", "Your balance, your yield, one-tap deposit", "Sortable market table across every pool"],
          ["Networks", "Invisible: Stellar under the hood", "Explicit network switcher, per-chain markets"],
          ["Borrowing", "Guided flow with guardrails and safe limits", "Per-market borrowing with full rate curves"],
          ["Market detail", "Not shown", "Interest-rate curve, APY history, advanced metrics per market"],
          ["Best for", "Saving and earning without the jargon", "Active DeFi users managing multiple positions"],
        ]}
      />

      <H2>Switching modes</H2>
      <P>
        Use the Easy/Expert toggle in the app header. The choice is remembered on your device, and a
        short intro explains the other mode the first time you switch. Deep links work too:{" "}
        <code className="font-mono text-[13px]">/app?view=easy</code> and{" "}
        <code className="font-mono text-[13px]">/app?view=expert</code>.
      </P>

      <Callout variant="info" title="Same engine underneath">
        Easy mode is not a separate product with different rates. A deposit made in Easy mode is the
        same on-chain position you'd see in Expert mode: same pool, same APY, same withdrawal rights.
        Expert mode just removes the simplifications.
      </Callout>
    </>
  )
}
