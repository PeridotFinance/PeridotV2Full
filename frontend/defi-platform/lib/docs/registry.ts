// Single source of truth for the /docs information architecture.
// Server-safe: metadata only, no React imports. The slug → content-component
// map lives in components/docs/content/index.tsx.
//
// Beyond navigation, every page carries three fields that exist for machines as
// much as for readers:
//
//   answer  a single self-contained paragraph that answers the page's title as a
//           question. It is the abstract in the JSON-LD, the summary line in
//           llms.txt, and the first thing an answer engine can lift verbatim.
//   faqs    question and answer pairs. They are rendered visibly at the foot of
//           the page AND emitted as FAQPage markup from the same array, because
//           the visible text is what actually earns a citation and markup that
//           disagrees with the page is worse than no markup.
//   updated the date the page was last reviewed, published as dateModified.
//
// Keep them in step with the prose. A summary that has drifted from the page it
// describes is the one failure mode that costs more than having no summary.

export interface DocFaq {
  q: string
  a: string
}

export interface DocPageMeta {
  slug: string
  title: string
  /** Short sidebar/search label; falls back to title. */
  navTitle?: string
  description: string
  /** Direct, self-contained answer to the page's subject. Plain text. */
  answer: string
  keywords: string[]
  faqs: DocFaq[]
  /** ISO date (YYYY-MM-DD) of the last content review. */
  updated: string
  badge?: "Testnet" | "Beta"
}

export interface DocSection {
  id: string
  title: string
  pages: DocPageMeta[]
}

const REVIEWED = "2026-09-01"

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "start-here",
    title: "Start Here",
    pages: [
      {
        slug: "what-is-peridot",
        title: "What is Peridot?",
        description:
          "Peridot is a non-custodial DeFi broker: one account for lending and borrowing across chains, with markets in USDC, EURC and XLM on Stellar.",
        answer:
          "Peridot is a DeFi broker: a single non-custodial account through which you reach on-chain lending markets on several blockchains. Depositors earn a variable interest rate paid by borrowers, borrowers take loans against their own deposited collateral, and an algorithm prices both sides from how much of each pool is lent out. Peridot never takes custody of your assets and never trades on your behalf; you sign every transaction and it settles directly on chain. The main markets run on Stellar and cover USDC, EURC and XLM.",
        keywords: [
          "what is peridot",
          "defi broker",
          "defi lending platform",
          "non-custodial lending",
          "stellar defi",
          "earn interest on crypto",
          "overview",
        ],
        faqs: [
          {
            q: "Is Peridot custodial?",
            a: "No. Peridot is non-custodial: your funds sit in on-chain smart contracts that only your own signature can move. Peridot cannot spend, freeze or reverse them, and it cannot recover your account if you lose access to your login and recovery options.",
          },
          {
            q: "Do I need a crypto wallet to use Peridot?",
            a: "No. Signing up with an email address or a social login creates a self-custodial wallet for you in the background. If you already have a wallet such as Freighter or MetaMask you can connect it instead.",
          },
          {
            q: "How does Peridot differ from a bank savings account?",
            a: "A bank pays a rate it sets and insures deposits up to a legal limit. Peridot pays whatever borrowers currently pay, which moves continuously and can be higher or lower, and there is no deposit insurance. In exchange there is no lock-up, no minimum, and no application.",
          },
          {
            q: "Which blockchains does Peridot support?",
            a: "The primary markets run on Stellar, with USDC, EURC and XLM. A multi-chain deployment on BNB Smart Chain with Ethereum, Polygon, Avalanche, Arbitrum and Base as spokes serves existing positions on the multi-chain version of the app.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "quickstart",
        title: "Quickstart: Earn Your First Yield",
        navTitle: "Quickstart",
        description:
          "Sign up with an email address, add money by bank transfer or card, and make your first earning deposit. The whole path, step by step, with screenshots.",
        answer:
          "To start earning on Peridot: sign in at peridot.finance/app with an email address, which creates a self-custodial wallet for you; add money by SEPA bank transfer, which is free and takes about one business day, or by card, which costs more but lands instantly; then deposit into a market and watch the balance accrue. There is no lock-up and no minimum holding period, so you can withdraw at any time. A first deposit typically takes a few minutes of active work plus the wait for the bank transfer.",
        keywords: [
          "getting started",
          "how to earn interest on stablecoins",
          "first deposit",
          "sign up",
          "add money",
          "sepa",
          "onboarding",
          "tutorial",
        ],
        faqs: [
          {
            q: "How long does the first deposit take?",
            a: "The account and identity check take a few minutes. The SEPA transfer itself is what you wait for, typically arriving the same or next business day. Card funding lands in seconds but carries the card provider's fee.",
          },
          {
            q: "Is there a minimum deposit?",
            a: "The lending markets have no minimum. The fiat rails do: cashing out has a small minimum per payout, and card providers apply their own floor.",
          },
          {
            q: "Do I have to pay gas fees?",
            a: "On Stellar a transaction costs a fraction of a cent, and the app covers the network fee in the normal consumer flows, so there is no separate gas token to buy or hold.",
          },
          {
            q: "Can I try Peridot without depositing money?",
            a: "Yes. Before you connect anything, the app runs in demo mode with realistic sample data, so you can walk through every screen without risk.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "easy-and-expert-mode",
        title: "Easy Mode & Expert Mode",
        navTitle: "Easy & Expert Mode",
        description:
          "One account, two interfaces: a plain savings view, or the full market console with rate curves, collateral controls and every network exposed.",
        answer:
          "Peridot ships two interfaces over the same account and the same on-chain positions. Easy mode speaks in money terms (deposit, withdraw, earn), hides networks entirely and guides borrowing with conservative limits. Expert mode speaks in protocol terms (supply, redeem, utilization, collateral factor), shows a sortable table of every market, exposes the network switcher and the interest-rate curves. Switching is a toggle in the header and changes nothing about your positions, rates or withdrawal rights.",
        keywords: [
          "easy mode",
          "expert mode",
          "beginner defi interface",
          "view mode",
          "switch",
          "interface",
        ],
        faqs: [
          {
            q: "Do Easy mode and Expert mode use different rates?",
            a: "No. Both are views onto the same on-chain positions. A deposit made in Easy mode is the identical position you would see in Expert mode, with the same pool, the same APY and the same withdrawal rights.",
          },
          {
            q: "How do I switch between the modes?",
            a: "Use the Easy and Expert toggle in the app header. The choice is remembered on your device, and you can also deep-link with /app?view=easy or /app?view=expert.",
          },
          {
            q: "Which mode should a beginner use?",
            a: "Easy mode. It removes the jargon and the network choice, and it suggests borrow limits well below the maximum. You can move to Expert mode later without migrating anything.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "networks-and-assets",
        title: "Networks & Assets",
        description:
          "Every market Peridot lists, its collateral factor and its rate model: XLM at 70%, USDC and EURC at 90% on Stellar, plus the multi-chain deployment.",
        answer:
          "Peridot's primary markets are on Stellar: XLM with a 70% collateral factor on a volatile rate curve, and USDC and EURC each with a 90% collateral factor on a stablecoin curve. The collateral factor is the share of a deposit's value you may borrow against, and the gap reflects volatility: stablecoins barely move against the dollar, XLM can swing double digits in a day. Alongside Stellar, a hub-and-spoke EVM deployment led by BNB Smart Chain serves experienced users on the multi-chain version of the app.",
        keywords: [
          "stellar lending markets",
          "xlm",
          "usdc",
          "eurc",
          "collateral factor",
          "supported chains",
          "markets",
          "bsc",
        ],
        faqs: [
          {
            q: "What is a collateral factor?",
            a: "The share of a deposit's value that counts toward your borrow limit. A 90% factor on 1,000 USDC adds 900 USD of borrowing power; a 70% factor on 1,000 USD of XLM adds 700.",
          },
          {
            q: "Why does XLM have a lower collateral factor than USDC?",
            a: "Because it is volatile. A wider gap between the loan and the collateral value leaves room for the price to fall before the position becomes liquidatable. Stablecoins need less of that cushion.",
          },
          {
            q: "Why did Peridot build on Stellar first?",
            a: "Transactions settle in about five seconds, fees are fractions of a cent, and Stellar has first-class support for regulated fiat rails. That combination is what makes a bank transfer land as an earning deposit without the user touching a bridge or a gas token.",
          },
          {
            q: "What is a boosted market?",
            a: "A market where deposits are additionally routed through an auto-compounding vault strategy for extra yield. Boosted markets are marked as such in the app, and the extra yield carries the underlying strategy's risk.",
          },
        ],
        updated: REVIEWED,
      },
    ],
  },
  {
    id: "lending-and-borrowing",
    title: "Lending & Borrowing",
    pages: [
      {
        slug: "supplying-and-ptokens",
        title: "Supplying Assets & pTokens",
        navTitle: "Supplying & pTokens",
        description:
          "What a deposit really is: pTokens, the exchange rate that only rises, and why your interest never needs claiming.",
        answer:
          "Depositing into a Peridot market mints pTokens, a receipt for your share of the pool. Interest is not paid out separately; instead the exchange rate between pTokens and the underlying asset rises as borrowers pay interest in, so the same number of pTokens redeems for more of the asset over time. The rate is (cash + totalBorrows − reserves) / totalPTokenSupply, and it only ever moves up. That is why interest on Peridot compounds continuously, needs no claiming, and does not interrupt when the same deposit is also used as collateral.",
        keywords: [
          "supply",
          "deposit",
          "ptoken",
          "receipt token",
          "exchange rate",
          "compound interest defi",
          "vault",
        ],
        faqs: [
          {
            q: "Do I have to claim my interest?",
            a: "No. Interest accrues into the pToken exchange rate every block, so your balance grows on its own. There is nothing to claim and nothing to reinvest.",
          },
          {
            q: "Can the pToken exchange rate fall?",
            a: "In normal operation no: it rises as borrowers pay interest into the pool. It is not a market price, it is a ratio of pool assets to receipts outstanding.",
          },
          {
            q: "Where do I see my pTokens in the app?",
            a: "You normally do not. The app shows your balance in the asset you deposited, already converted at the live rate. Expert mode's market details expose the raw figures.",
          },
          {
            q: "Does my collateral keep earning interest?",
            a: "Yes. pTokens pledged as collateral continue to accrue supply interest, which partially offsets what you pay on the loan.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "interest-rates",
        title: "Interest Rates: The Jump Rate Model",
        navTitle: "Interest Rates",
        description:
          "The exact formulas that set every rate on Peridot, from utilization through the kink to the APY you see, with an interactive curve explorer.",
        answer:
          "Peridot sets rates algorithmically from one input: utilization, the share of a pool currently lent out, computed as totalBorrows / (cash + totalBorrows). The borrow rate follows two straight lines meeting at a kink around 80% utilization: gentle below it, steep above it, so a pool that is nearly drained prices liquidity high enough to attract deposits and encourage repayment. Suppliers earn borrowRate × utilization × (1 − reserveFactor), an identity that guarantees the pool never promises yield it is not collecting. No committee is involved, and rates move whenever anyone deposits, withdraws, borrows or repays.",
        keywords: [
          "interest rate model",
          "jump rate model",
          "utilization",
          "kink",
          "apy vs apr",
          "borrow rate",
          "supply rate formula",
        ],
        faqs: [
          {
            q: "Why did my APY change without me doing anything?",
            a: "Because rates track utilization, and utilization changes whenever anyone else deposits, withdraws, borrows or repays in the same pool. That is the mechanism working, not a fault.",
          },
          {
            q: "What is the kink in the jump rate model?",
            a: "The utilization level, typically 80%, where the rate curve changes slope. Below it rates climb gently; above it they climb steeply, which is the pool's defence against running out of withdrawable liquidity.",
          },
          {
            q: "What is the difference between APR and APY here?",
            a: "APR is the simple annualized rate the contract quotes. APY includes compounding, which on Peridot happens automatically through the exchange rate, so APY is the number your balance actually tracks.",
          },
          {
            q: "What is the reserve factor?",
            a: "The share of borrower interest that accrues to protocol reserves as an insurance buffer instead of to suppliers. It is why the supply rate is always below the borrow rate.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "borrowing-and-collateral",
        title: "Borrowing & Collateral",
        description:
          "Borrow against your deposits without selling them: how collateral factors set your limit, what a loan costs, and how repayment works.",
        answer:
          "Borrowing on Peridot is overcollateralized: you can only borrow against value you have already deposited, and always less than that value. Your limit is the sum over each collateral deposit of its value times its collateral factor, minus what you already owe. Because the loan is secured by your own deposit there is no credit check and no repayment schedule; interest accrues by the block only for as long as you owe, and any repayment instantly restores your limit. The collateral keeps earning supply interest the whole time.",
        keywords: [
          "borrow against crypto",
          "collateral",
          "loan to value",
          "borrow limit",
          "repay",
          "overcollateralized loan",
          "liquidity without selling",
        ],
        faqs: [
          {
            q: "How much can I borrow?",
            a: "The sum of each collateral deposit's value multiplied by its collateral factor, less anything already borrowed. For example 1,000 USD of USDC at 90% plus 1,000 USD of XLM at 70% gives a 1,600 USD limit.",
          },
          {
            q: "Is there a credit check?",
            a: "No. The loan is secured by collateral you have already deposited, so there is nothing to underwrite. No paperwork, no score, no application.",
          },
          {
            q: "When do I have to repay?",
            a: "Never on a schedule. Repay any amount at any time; interest accrues only for the period you actually owe. The one obligation is to keep the debt below your borrow limit.",
          },
          {
            q: "Can I withdraw collateral while a loan is open?",
            a: "Yes, as long as the borrow limit left after the withdrawal still covers your outstanding debt. The app blocks withdrawals that would push you past that point.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "health-factor-and-liquidation",
        title: "Health Factor & Liquidation",
        navTitle: "Health & Liquidation",
        description:
          "The single number that says whether your loan is safe, what happens at 1.0, and an interactive simulator to crash the price before the market does.",
        answer:
          "The health factor is your borrow limit divided by your debt. Above 1.0 the position is safe; at 1.0 it becomes eligible for liquidation, where anyone may repay part of the debt in exchange for a matching slice of collateral plus a small bonus. A health factor of 2.0 means you are using half your limit; 1.1 means a 9% adverse price move exhausts your buffer. Two things move it: prices, and the borrow interest that grows the debt over time. Repaying or adding collateral raises it immediately.",
        keywords: [
          "health factor",
          "liquidation",
          "liquidation price",
          "defi risk",
          "safety",
          "simulator",
          "margin call",
        ],
        faqs: [
          {
            q: "What health factor is safe?",
            a: "There is no official threshold, but the further above 1.0 the better. On volatile collateral such as XLM, using under half your limit means roughly a 50% price crash is needed before liquidation, which is a common conservative target.",
          },
          {
            q: "What actually happens in a liquidation?",
            a: "Anyone may repay a portion of your debt and receive a matching slice of your collateral plus a small bonus, the liquidation incentive. It trims the position back to solvency rather than seizing everything, and it exists so the pool's depositors are never left holding an underwater loan.",
          },
          {
            q: "Can I be liquidated even if prices never move?",
            a: "Eventually, yes. Borrow interest compounds against you, so a position parked just above its limit and forgotten will drift below 1.0 given enough time.",
          },
          {
            q: "Am I at risk of liquidation if I only deposit?",
            a: "No. Liquidation applies only to borrowing positions. A depositor who never borrows has no health factor to defend.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "apy-and-rewards",
        title: "APY, Rewards & Boosted Yields",
        navTitle: "APY & Rewards",
        description:
          "Where every percentage point of Peridot's yield comes from: base lending interest, boosted vault strategies and token incentives, separated honestly.",
        answer:
          "The APY shown on a Peridot market can stack up to three layers. The base layer is borrower interest, set by the jump rate model and delivered through the rising pToken exchange rate; it compounds continuously and needs no claiming. On selected Stellar markets a second layer comes from an auto-compounding vault strategy, shown as a boost and carrying that strategy's risk. A third layer is optional PERIDOT token incentives, displayed on a separate line so promotional yield is never mistaken for sustainable yield. Every layer is derivable from the formulas in these docs.",
        keywords: [
          "apy",
          "defi yield",
          "boosted yield",
          "rewards",
          "compound interest",
          "earnings projection",
          "where does defi yield come from",
        ],
        faqs: [
          {
            q: "Where does the yield actually come from?",
            a: "From borrowers. Every percentage point of supply APY is interest a borrower on the other side of the same pool is paying, plus, on boosted markets, the returns of the vault strategy. There is no other source.",
          },
          {
            q: "Is the APY guaranteed?",
            a: "No. It is variable by construction and changes with utilization. The figure shown is the current rate, not a promise for the year.",
          },
          {
            q: "Why does a rate show as less than 0.01%?",
            a: "Sub-basis-point rates are displayed as <0.01% rather than rounded to 0.00%, so a small but real rate is never shown as nothing.",
          },
          {
            q: "Why is the APY chart on a new market so short?",
            a: "Charts show real recorded history only. A young market has little history, and Peridot does not backfill estimated data to make the line look longer.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "risks",
        title: "Risks",
        description:
          "The honest list: smart-contract, liquidation, liquidity, oracle, stablecoin and variable-rate risk, what mitigates each, and what remains yours.",
        answer:
          "Peridot pays more than a savings account because it carries risks a savings account does not. Smart-contract risk is the irreducible one: a bug could cost funds, mitigated by an audited, battle-tested money-market design and conservative parameters but never eliminated. Liquidation risk applies only to borrowers and is largely in their control. Liquidity risk means a large withdrawal may wait at very high utilization. Oracle risk means a wrong price could trigger a wrongful liquidation. Stablecoin risk means USDC and EURC are issuer liabilities, not insured bank deposits. Rates are variable in both directions, and there is no deposit insurance anywhere in DeFi.",
        keywords: [
          "defi risks",
          "is defi lending safe",
          "smart contract risk",
          "audit",
          "oracle risk",
          "stablecoin depeg",
          "liquidity risk",
        ],
        faqs: [
          {
            q: "Is my money insured on Peridot?",
            a: "No. There is no deposit insurance anywhere in DeFi. Protocol reserves act as a buffer, but they are not a guarantee and they are not a government scheme.",
          },
          {
            q: "What is the single biggest risk?",
            a: "Smart-contract risk, because it is the one you cannot manage by behaving prudently. It is mitigated by audits and by following the battle-tested Compound money-market design, but the honest advice remains not to deposit more than you could afford to lose entirely.",
          },
          {
            q: "Can Peridot freeze or seize my funds?",
            a: "No. Peridot is non-custodial software and cannot move your assets, reverse a transaction, reimburse a loss or recover a lost key.",
          },
          {
            q: "What happens if USDC loses its peg?",
            a: "Positions denominated in it would follow the price down. USDC and EURC are issued by Circle, a regulated issuer with attested reserves, but they are issuer liabilities rather than bank deposits.",
          },
        ],
        updated: REVIEWED,
      },
    ],
  },
  {
    id: "using-the-app",
    title: "Using the App",
    pages: [
      {
        slug: "portfolio-and-activity",
        title: "Portfolio, Activity & History",
        navTitle: "Portfolio & Activity",
        description:
          "Reading your positions and live earnings, the activity feed, and the CSV export your accountant will ask for.",
        answer:
          "The portfolio shows every position valued live, with all-time earnings called out separately, a history chart built only from real recorded snapshots, and an allocation breakdown. Earnings means interest actually accrued: current position value minus your net deposits into it, updating continuously because interest compounds into the exchange rate rather than being paid on a schedule. Every deposit, withdrawal, borrow and repayment appears in the activity feed in plain language, and Account then Tax export downloads the full history as CSV with timestamps, assets, amounts and USD values at execution time.",
        keywords: [
          "portfolio",
          "positions",
          "activity feed",
          "transaction history",
          "earnings",
          "csv export",
          "crypto tax report",
        ],
        faqs: [
          {
            q: "How is the earnings figure calculated?",
            a: "Current position value minus your net deposits into that position. It is interest actually accrued to you, not a projection.",
          },
          {
            q: "Can I export my transactions for taxes?",
            a: "Yes. Account then Tax export produces a CSV of your full history with timestamps, assets, amounts and the USD value at execution time, ready to hand to a tax tool or an advisor.",
          },
          {
            q: "Why does my portfolio chart start so recently?",
            a: "The chart plots real daily snapshots only. A new account has few of them, and Peridot does not invent a backfill to make the line longer.",
          },
          {
            q: "Do I see the same portfolio on another device?",
            a: "Yes. Positions live on chain and your login travels with your email, so signing in anywhere shows the same portfolio. Nothing is stored only on one phone.",
          },
        ],
        updated: REVIEWED,
      },
      {
        slug: "add-and-withdraw-money",
        title: "Adding & Withdrawing Money",
        navTitle: "Add & Withdraw Money",
        description:
          "SEPA bank transfer, card and Apple Pay in, cash-out to your own IBAN back out. Both flows screen by screen, with fees, timelines and every status explained.",
        answer:
          "Peridot connects to the banking system in both directions. Money in: a one-time identity check opens a euro account in your own name, you transfer to that personal IBAN, and the euros arrive as digital dollars, typically the same or next business day, with up to 1% FX on the conversion; card and Apple Pay are instant but cost the provider's fee. Money out: register a destination account once, where the BIC is optional because SEPA has routed on the IBAN alone since 2016, then pay out to it, typically the same or next business day. Peridot adds no fee of its own on either leg.",
        keywords: [
          "sepa deposit crypto",
          "fiat onramp",
          "fiat offramp",
          "bank transfer",
          "iban",
          "card",
          "apple pay",
          "cash out to bank",
          "kyc",
        ],
        faqs: [
          {
            q: "How long does a SEPA deposit take to arrive?",
            a: "Typically the same or next business day. Card and Apple Pay funding is instant but carries the card provider's fee.",
          },
          {
            q: "What does adding money cost?",
            a: "Peridot charges no deposit or withdrawal fee on the lending side. SEPA itself is close to free, the euro to dollar conversion costs up to 1%, and card providers charge a percentage. Every cost is shown before you confirm.",
          },
          {
            q: "Why do I have to complete an identity check?",
            a: "EU regulation requires it of anyone handling euro payments. It is a one-time check, usually done in about a minute, and it is what allows a euro account to be opened in your own name.",
          },
          {
            q: "Can I send money from someone else's bank account?",
            a: "No. The sending and the receiving account must both be in your own name. Transfers from a third party may be delayed or returned.",
          },
          {
            q: "Do I need the BIC to cash out?",
            a: "No. The BIC field is optional. SEPA payments have been routed on the IBAN alone since 2016, so you only need to supply it if you happen to know it.",
          },
        ],
        updated: REVIEWED,
      },
    ],
  },
  {
    id: "margin",
    title: "Margin Trading",
    pages: [
      {
        slug: "margin-trading",
        title: "Margin Trading on Stellar",
        navTitle: "Margin Trading",
        description:
          "Leveraged long and short XLM positions on Stellar: the sizing math, the three-step on-chain open, liquidation prices and every protection parameter.",
        answer:
          "Peridot's margin product opens leveraged long or short XLM positions against USDT margin, currently on the Stellar testnet. Position size is margin times leverage, with 2x to 5x available, and the protocol borrows the difference from the same lending pools documented elsewhere in these docs. Nothing is paid into your wallet: the borrow and the swap happen inside the protocol and the position is held by the margin controller as collateral. A position becomes liquidatable when its value, discounted by the 5% maintenance margin, no longer covers the debt, and opens are blocked outright if the pool price drifts more than 5% from the oracle price.",
        keywords: [
          "margin trading",
          "leverage",
          "long xlm",
          "short xlm",
          "liquidation price",
          "take profit",
          "stop loss",
          "stellar perps",
        ],
        faqs: [
          {
            q: "What leverage can I use?",
            a: "Between 2x and 5x, in integer steps. Position size is your margin multiplied by the leverage, and the protocol borrows the difference.",
          },
          {
            q: "How is the liquidation price calculated?",
            a: "A position is liquidatable when its value discounted by the 5% maintenance margin no longer covers the debt. At entry that gives liqPrice = entry × (lev − 1) / (lev × 0.95) for a long, and entry × 0.95 × lev / (lev − 1) for a short. Accrued borrow interest shifts the real threshold over time, and the on-chain health figure is authoritative.",
          },
          {
            q: "Why was my position blocked from opening?",
            a: "Most often the oracle band: if the on-chain liquidity pool's price strays more than 5% from the independent oracle price, opens are refused and no slippage setting can override it. That protects you from opening into a thin or manipulated market.",
          },
          {
            q: "Do take-profit and stop-loss orders work with the app closed?",
            a: "An always-on server keeper can arm triggers that fire with the app closed. The client-side monitor only runs while the page is open.",
          },
          {
            q: "Is margin trading live on mainnet?",
            a: "Not yet. It runs on the Stellar testnet with test funds, isolated from mainnet lending, and a paper-trading mode lets you practise at zero risk.",
          },
        ],
        updated: REVIEWED,
        badge: "Testnet",
      },
    ],
  },
  {
    id: "points",
    title: "Points & Leaderboard",
    pages: [
      {
        slug: "points-and-leaderboard",
        title: "Points & the Leaderboard",
        navTitle: "Points & Leaderboard",
        description:
          "Exact point values per action, the anti-farming rules, badges and seasons, and the Ambassador Program that pays $5 to each side.",
        answer:
          "Points reward real participation. A verified deposit earns 20 points, a borrow 30, a repayment 10 and a withdrawal 5, with a size bonus from +10 at $100 up to +200 at $50,000. Anti-farming rules cap the abuse: anything under $1 earns exactly 1 point, and the day's third to fifth transactions earn half, the sixth to tenth a quarter, and the rest 10%. A daily login adds 50. Points accrue to your Peridot account across every linked wallet, not to one address, and they are not a token and carry no guaranteed monetary value.",
        keywords: [
          "points",
          "leaderboard",
          "rewards program",
          "badges",
          "seasons",
          "referral",
          "ambassador program",
          "streak",
        ],
        faqs: [
          {
            q: "How many points does a deposit earn?",
            a: "20 base points, plus a size bonus from +10 for at least $100 up to +200 for at least $50,000, subject to the daily throttle.",
          },
          {
            q: "Can I farm points with many tiny transactions?",
            a: "No. Any transaction under $1 earns exactly 1 point, and the day's third to fifth transactions earn half points, the sixth to tenth a quarter, and everything beyond 10%.",
          },
          {
            q: "How does the referral reward work?",
            a: "When someone who joined through your invite link holds at least $100 deposited in the Peridot Stellar markets for 30 consecutive days, you and they each earn $5 in USDC. Balances are read on chain once a day, withdrawing below $100 restarts the count, and payouts are sent by hand after the milestone.",
          },
          {
            q: "Do points have monetary value?",
            a: "No. Points rank the leaderboard and unlock badges. They are not a token and carry no guaranteed value. If that ever changes it will be announced explicitly.",
          },
          {
            q: "Do my wallets share one score?",
            a: "Yes. Points accrue to your Peridot account, and verified activity from every linked EVM or Stellar wallet pools into a single score. Wallets created by email login are linked automatically.",
          },
        ],
        updated: REVIEWED,
      },
    ],
  },
]

/** Non-docs pages linked from the docs sidebar. */
export const DOC_EXTERNAL_LINKS: Array<{ title: string; href: string }> = [
  { title: "DeFi Glossary", href: "/glossary" },
  { title: "FAQ", href: "/faq" },
  { title: "App Handbook", href: "/guide" },
]

export const ALL_DOC_PAGES: DocPageMeta[] = DOC_SECTIONS.flatMap((s) => s.pages)

export function getDocPage(slug: string): DocPageMeta | undefined {
  return ALL_DOC_PAGES.find((p) => p.slug === slug)
}

export function getDocSectionForPage(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((s) => s.pages.some((p) => p.slug === slug))
}

export function getAdjacentDocPages(slug: string): {
  prev: DocPageMeta | null
  next: DocPageMeta | null
} {
  const idx = ALL_DOC_PAGES.findIndex((p) => p.slug === slug)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? ALL_DOC_PAGES[idx - 1] : null,
    next: idx < ALL_DOC_PAGES.length - 1 ? ALL_DOC_PAGES[idx + 1] : null,
  }
}
