import { Callout, H2, Lead, LinkCard, LinkCardGrid, P, StepList } from "../primitives"
import { EarningsProjector } from "../widgets/EarningsProjector"

export default function Quickstart() {
  return (
    <>
      <Lead>
        Everything from a fresh browser tab to an earning deposit. No prior crypto experience
        assumed: if you can use online banking, you can do this.
      </Lead>

      <H2>Create your account</H2>
      <StepList
        steps={[
          {
            title: "Open the app and sign in",
            body: (
              <>
                Go to <a href="/app">peridot.finance/app</a> and sign in with your email address or a
                social login. A secure wallet is created for you automatically. You stay in control;
                Peridot never holds your money.
              </>
            ),
          },
          {
            title: "Look around in demo mode",
            body: "Before connecting anything, the app shows realistic demo data so you can explore every screen risk-free.",
          },
        ]}
      />

      <H2>Add money</H2>
      <StepList
        steps={[
          {
            title: "Tap “Add money”",
            body: "Choose bank transfer (SEPA) or card / Apple Pay. Bank transfer has the lowest fees; card is instant.",
          },
          {
            title: "One-time identity check",
            body: "For bank transfers, a short KYC check is required by regulation. It is usually done in a couple of minutes.",
          },
          {
            title: "Transfer to your personal IBAN",
            body: "You get a dedicated IBAN. Send euros from your bank; they arrive as digital dollars (USDC) or euros (EURC) in your Peridot wallet, typically the same business day.",
          },
        ]}
      />

      <H2>Make your first deposit</H2>
      <StepList
        steps={[
          {
            title: "Pick an asset and amount",
            body: "On the home screen, choose what to deposit; for a first run, the USD or EUR pool is the natural pick. Enter the amount and confirm.",
          },
          {
            title: "Watch it earn",
            body: "Your position appears in the portfolio with a live APY and starts accruing interest immediately, every few seconds.",
          },
          {
            title: "Withdraw whenever you like",
            body: "There is no lock-up and no notice period. Withdrawals return your deposit plus everything it earned.",
          },
        ]}
      />

      <Callout variant="tip" title="What could this earn?">
        Play with the projector below. Rates on Peridot are variable, and the live APY is always
        shown in the app before you confirm.
      </Callout>

      <EarningsProjector />

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/add-and-withdraw-money"
          title="Adding & withdrawing money"
          description="The fiat rails in detail: SEPA, cards, cashing out, timelines and statuses."
        />
        <LinkCard
          href="/docs/apy-and-rewards"
          title="APY & rewards"
          description="Where the yield actually comes from, and what 'variable' means in practice."
        />
      </LinkCardGrid>
    </>
  )
}
