import { Callout, DocTable, H2, Lead, LinkCard, LinkCardGrid, P } from "../primitives"
import { ScreenshotWalkthrough } from "../widgets/ScreenshotWalkthrough"

export default function AddAndWithdrawMoney() {
  return (
    <>
      <Lead>
        Peridot connects to the regular banking system in both directions: money in by SEPA bank
        transfer or card, money out to your bank account. This page walks through both flows screen
        by screen, with the timelines and what each status message means.
      </Lead>

      <H2>Money in: bank transfer (SEPA)</H2>
      <P>
        The first transfer takes a few minutes to set up. Every one after that is an ordinary bank
        transfer to an account that belongs to you.
      </P>
      <ScreenshotWalkthrough
        steps={[
          {
            title: "Open Funding in your wallet",
            src: "/docs/fiat/funding-start.webp",
            width: 622,
            height: 616,
            alt: "The Funding tab of the wallet dialog, offering bank transfer in euros and instant card funding.",
            body: (
              <>
                Your wallet has two ways in. <strong>Bank transfer</strong> is free and takes about
                one business day; <strong>card and Apple&nbsp;Pay</strong> cost more but land
                instantly. Bank transfers need a one-time verification first; that&rsquo;s what
                &ldquo;Set up bank transfers&rdquo; starts.
              </>
            ),
          },
          {
            title: "Confirm your email and country",
            src: "/docs/fiat/identity-check.webp",
            width: 622,
            height: 600,
            alt: "Step 1 of 3: a form asking for email address and country of residence.",
            body: (
              <>
                Step 1 of 3. Your email is already filled in from your account; you only pick your
                country of residence. Next you accept our payment partner&rsquo;s terms and run a
                short identity check (KYC), required by EU regulation for anyone handling euros
                and usually done in about a minute.
              </>
            ),
          },
          {
            title: "Wait for the account to be enabled",
            src: "/docs/fiat/enabling-transfers.webp",
            width: 622,
            height: 472,
            alt: "Step 2 of 3, showing that bank transfers are being enabled on the account.",
            body: (
              <>
                Once your identity is verified, our payment partner enables euro transfers on your
                account. This page updates on its own: you can close it and come back, nothing is
                lost.
              </>
            ),
          },
          {
            title: "Approve the account in your name",
            src: "/docs/fiat/verified.webp",
            width: 544,
            height: 445,
            alt: "The verified state, explaining that a EUR bank account will be opened in the user's name.",
            body: (
              <>
                The euro account is opened <strong>in your own name</strong>. This screen also states
                the one cost of the route before you commit to it: euros arriving are converted to
                digital dollars (USDC) at up to&nbsp;1% FX.
              </>
            ),
          },
          {
            title: "Send euros to your IBAN",
            src: "/docs/fiat/iban-details.webp",
            width: 544,
            height: 737,
            alt: "The finished bank details: account holder, IBAN, BIC and bank, with a name-match warning and an arrival-notification row.",
            body: (
              <>
                You now have a personal IBAN. Transfer to it from a bank account{" "}
                <strong>in your own name</strong>. Transfers from someone else&rsquo;s account may
                be delayed or returned. Because a SEPA transfer can take until the next business day,
                you can switch on a notification that reaches you even with the tab closed.
              </>
            ),
          },
        ]}
      />
      <DocTable
        headers={["Status", "Meaning"]}
        rows={[
          ["Processing", "Your transfer was received and is being converted."],
          ["In review", "A routine compliance check is running; it typically resolves within hours."],
          ["Added", "Done: the money is in your wallet."],
          ["Returned", "The transfer couldn't be processed and was sent back to your bank account."],
        ]}
      />

      <H2>Money in: card &amp; Apple Pay</H2>
      <P>
        For instant funding, pay by card or Apple Pay. Card processing is handled by licensed payment
        providers; fees are higher than SEPA (the provider&rsquo;s cut, shown before you confirm),
        but funds are usable immediately. After payment, the app watches for the funds to arrive and
        resumes your deposit automatically.
      </P>

      <H2>Money out: cash out to your bank</H2>
      <P>
        If your money is deposited and earning, withdraw it to your wallet first; that part is
        instant and works for any amount. Cashing out then moves it from your wallet to your bank.
      </P>
      <ScreenshotWalkthrough
        steps={[
          {
            title: "Add the bank account to pay out to",
            src: "/docs/fiat/cashout-bank-form.webp",
            width: 544,
            height: 627,
            alt: "The cash-out bank form asking for account holder, IBAN, an optional BIC, and country.",
            body: (
              <>
                Asked once, then remembered. <strong>The BIC is optional</strong>: SEPA has been
                routed on the IBAN alone since 2016, so you only need it if you happen to know it.
                Like the incoming account, the destination must be in your own name.
              </>
            ),
          },
          {
            title: "Enter the amount",
            src: "/docs/fiat/cashout-amount.webp",
            width: 544,
            height: 616,
            alt: "The cash-out amount screen showing the destination account and the fee line.",
            body: (
              <>
                You see the destination and your available balance before anything moves, and the fee
                position in plain words: <em>Peridot adds no fee of its own.</em> The payout arrives
                by SEPA, typically the same or next business day.
              </>
            ),
          },
          {
            title: "Amounts that can't work are refused early",
            src: "/docs/fiat/cashout-minimum.webp",
            width: 544,
            height: 657,
            alt: "The amount field showing two validation messages: more than available, and below the minimum.",
            body: (
              <>
                Below the minimum, or more than you hold, and the button stays disabled with the
                reason spelled out. There is a small minimum per cash-out (€1 in euros, $2 in
                dollars) because the banking rails cost more than a smaller transfer is worth.
              </>
            ),
          },
        ]}
      />

      <Callout variant="info" title="Fees, plainly">
        Peridot doesn&rsquo;t charge deposit or withdrawal fees on the lending side. Fiat rails carry
        their own costs (SEPA itself is near-free, the euro-to-dollar conversion is up to&nbsp;1%,
        and card providers charge a percentage), and every one of them is shown before you confirm,
        never after.
      </Callout>

      <Callout variant="tip" title="About these screenshots">
        The screens above were captured in our test environment, so the account holder, IBAN and
        balances are sample data. What you see in the app is your own.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/quickstart"
          title="Quickstart"
          description="The full first-run walkthrough, including your first deposit."
        />
        <LinkCard
          href="/docs/portfolio-and-activity"
          title="Portfolio & activity"
          description="Where funding and cash-out transactions appear in your history."
        />
      </LinkCardGrid>
    </>
  )
}
