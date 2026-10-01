import { Callout, H2, Lead, LinkCard, LinkCardGrid, RiskCard, RiskCardGrid, UL } from "../primitives"

export default function Risks() {
  return (
    <>
      <Lead>
        Peridot pays more than a savings account because it carries risks a savings account doesn&apos;t.
        Here&apos;s the honest list, scored by severity and by who actually carries it. Read this page
        in full before you deposit more than you can afford to lose.
      </Lead>

      <RiskCardGrid>
        <RiskCard title="Smart-contract risk" level="medium" who="Everyone">
          Your deposit lives in on-chain code; a bug there could cost you funds. This is DeFi&apos;s
          irreducible base risk. Peridot mitigates it with a battle-tested Compound-style design,
          third-party <a href="/audits">audits</a>, and conservative parameters, but mitigated isn&apos;t
          eliminated.
        </RiskCard>

        <RiskCard title="Liquidation risk" level="medium" who="Borrowers only">
          Let your <a href="/docs/health-factor-and-liquidation">health factor</a> hit 1.0 and part of
          your collateral sells at a discount. Fully in your control: borrow conservatively, prefer
          stable collateral, keep an eye on open positions. Pure depositors never see this.
        </RiskCard>

        <RiskCard title="Liquidity risk" level="low" who="Everyone">
          Withdrawals draw on the pool&apos;s idle cash. At very high utilization, a large withdrawal
          may wait for repayments or new deposits. The jump rate model exists to make that state
          short-lived, not to promise it never happens.
        </RiskCard>

        <RiskCard title="Oracle risk" level="low" who="Everyone">
          Collateral prices come from Reflector on Stellar. A wrong price could trigger a bad
          liquidation or under-collateralized borrowing. Redundant feeds and sanity bands cut the
          odds; the residual sits mostly in volatile-asset markets.
        </RiskCard>

        <RiskCard title="Stablecoin & peg risk" level="low" who="USDC / EURC holders">
          USDC and EURC are Circle liabilities with attested reserves, not bank deposits. A depeg
          flows straight through to positions denominated in them, and there&apos;s no deposit
          insurance anywhere in DeFi.
        </RiskCard>

        <RiskCard title="Variable-rate risk" level="medium" who="Everyone">
          <UL>
            <li>Supply APY can fall, sometimes sharply, as utilization drops.</li>
            <li>Borrow APR can rise mid-loan, accelerating what you owe.</li>
            <li>Neither is capped; both are visible live before and after you act.</li>
          </UL>
        </RiskCard>
      </RiskCardGrid>

      <Callout variant="warning" title="No advice, no insurance">
        Nothing here is financial advice. Peridot is non-custodial software: it cannot reverse
        transactions, reimburse losses, or recover keys. DeFi regulation varies by jurisdiction and
        may affect your access or tax treatment.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/health-factor-and-liquidation"
          title="Health factor & liquidation"
          description="The one risk you can simulate before taking it."
        />
        <LinkCard
          href="/audits"
          title="Security & audits"
          description="Audit reports and security posture."
        />
      </LinkCardGrid>
    </>
  )
}
