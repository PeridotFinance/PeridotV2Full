export type InsightsPath = "starter" | "yield" | "risk" | "market" | "action"
export type InsightsDifficulty = "beginner" | "intermediate" | "advanced"

export interface GlossaryTerm {
  term: string
  slug: string
  definitionShort: string
}

export type CheckpointOption = {
  text: string
  correct: boolean
  explanation: string
}

export type InsightsBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "callout"; text: string }
  | { type: "image"; url: string; alt: string; caption?: string }
  | { type: "checkpoint"; question: string; options: CheckpointOption[] }
  | { type: "calculator"; variant: "health-factor" | "apy-vs-apr" | "yield-return"; label?: string }
  | { type: "predict"; prompt: string; options: string[]; correctIndex: number; reveal: string }
  | { type: "jenga"; loanAmount?: number; liqLtv?: number; initialBlocks?: number }
  | { type: "vault-builder"; initialCoins?: Array<"eth" | "btc" | "usdc">; targetCollateral?: number }
  | { type: "borrowing-power"; assets?: Array<"eth" | "btc" | "usdc"> }
  | { type: "leverage-seesaw"; maxLeverage?: number }
  | { type: "rate-highway"; kinkUtilization?: number }
  | { type: "liquidation-dominoes" }
  | { type: "apy-snowball"; rate?: number; months?: number }
  | { type: "position-builder" }

/** Position metadata for a chapter within a learning path */
export interface InsightsChapterRef {
  slug: string
  title: string
  order: number   // 1-indexed position within the path
}

/** Position metadata for a lesson within its chapter */
export interface InsightsLessonRef {
  order: number   // 1-indexed position within the chapter
}

export interface InsightsArticle {
  id: string
  slug: string
  path: InsightsPath
  chapter: InsightsChapterRef
  lesson: InsightsLessonRef
  title: string
  excerpt: string
  coverImage: string
  difficulty: InsightsDifficulty
  readTimeMin: number
  publishedAt: string
  tags: string[]
  liveAsset: "ETH" | "BTC" | "SOL" | "USDC"
  ctaLabel: string
  ctaHref: string
  blocks: InsightsBlock[]
  peridotRelevance?: "high" | "medium" | "low" | "none"
  actionArticleSuggestion?: { title: string; slug: string } | null
}

/** A chapter with all its lessons sorted by lesson.order */
export interface InsightsChapterMeta {
  slug: string
  title: string
  order: number
  path: InsightsPath
  lessons: InsightsArticle[]
}

// ── Path config ────────────────────────────────────────────────────────────────

export const insightsPathConfig: Record<InsightsPath, { label: string; description: string }> = {
  starter: {
    label: "DeFi Starter",
    description: "Learn how DeFi works, step by step, in plain English.",
  },
  yield: {
    label: "Earn Interest",
    description: "Find the best ways to grow your crypto and understand what you're earning.",
  },
  risk: {
    label: "Stay Safe",
    description: "Learn how to protect your money and avoid the most common mistakes.",
  },
  market: {
    label: "Market Updates",
    description: "Simple daily updates on what's happening in crypto — no jargon.",
  },
  action: {
    label: "Use Peridot",
    description: "Step-by-step guides to put DeFi into practice on Peridot.",
  },
}

// ── Glossary ──────────────────────────────────────────────────────────────────

export const glossaryTerms: GlossaryTerm[] = [
  { term: "APY", slug: "apy", definitionShort: "Annual Percentage Yield including compounding." },
  { term: "TVL", slug: "tvl", definitionShort: "Total Value Locked in a DeFi protocol." },
  { term: "Liquidation", slug: "liquidation", definitionShort: "Forced position close when collateral safety drops too low." },
  { term: "Collateral", slug: "collateral", definitionShort: "Assets pledged as security for a loan." },
  { term: "Slippage", slug: "slippage", definitionShort: "Price difference between expected and executed trade." },
  { term: "Impermanent Loss", slug: "impermanent-loss", definitionShort: "Temporary loss from asset price divergence in LP pools." },
]

// ── Articles ──────────────────────────────────────────────────────────────────

export const insightsArticles: InsightsArticle[] = [

  // ── Starter · Chapter 1: DeFi Basics ──────────────────────────────────────

  {
    id: "ins_001",
    slug: "defi-onboarding-in-15-minutes",
    path: "starter",
    chapter: { slug: "defi-basics", title: "DeFi Basics", order: 1 },
    lesson: { order: 1 },
    title: "DeFi Onboarding in 15 Minutes",
    excerpt: "The fastest path from zero to your first safe DeFi position.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 9,
    publishedAt: "2026-02-20T10:00:00Z",
    tags: ["Beginner", "Wallet", "Security"],
    liveAsset: "ETH",
    ctaLabel: "Start Swap in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Mission setup: your first 15 minutes" },
      { type: "paragraph", text: "Start with a clean setup: wallet, small test amount, and clear risk limits you can explain in one sentence." },
      { type: "paragraph", text: "Goal for this run: execute one minimal transaction and verify every step before increasing size." },
      { type: "callout", text: "Keep the first transaction intentionally small. You are testing your process, not chasing yield." },
      { type: "heading", text: "Checklist before touching any protocol" },
      { type: "paragraph", text: "Confirm network, contract route, and token decimals. Most beginner mistakes happen before clicking confirm." },
      { type: "paragraph", text: "Set maximum tolerated {Slippage} before you swap so execution cannot drift beyond your plan." },
      { type: "heading", text: "Execution phase: one controlled transaction" },
      { type: "paragraph", text: "Use a small amount, submit, then inspect transaction status and resulting position details." },
      { type: "paragraph", text: "If execution differs from expectation, pause and diagnose before repeating. Fast feedback beats fast volume." },
      { type: "callout", text: "Write down what happened: expected input, actual output, and fee paid. This is your repeatable playbook." },
      { type: "heading", text: "Post-trade review: build confidence loops" },
      { type: "paragraph", text: "Track one position metric and one risk metric after each action. Keep it simple and consistent." },
      { type: "paragraph", text: "When your process is stable, increase size in steps. Never jump from test size to full allocation." },
      { type: "callout", text: "Graduate rule: three clean repetitions before scaling. Discipline compounds faster than noise." },
    ],
  },

  {
    id: "ins_006",
    slug: "how-wallets-and-keys-work",
    path: "starter",
    chapter: { slug: "defi-basics", title: "DeFi Basics", order: 1 },
    lesson: { order: 2 },
    title: "How Wallets and Keys Actually Work",
    excerpt: "What a seed phrase really is, why it matters, and how to keep it safe.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 8,
    publishedAt: "2026-02-21T10:00:00Z",
    tags: ["Wallet", "Security", "Keys"],
    liveAsset: "ETH",
    ctaLabel: "Open Wallet Guide",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Your seed phrase is the wallet, not the app" },
      { type: "paragraph", text: "The app on your phone is just a viewer. Your seed phrase is the actual ownership proof, and anyone who has it controls your funds." },
      { type: "paragraph", text: "Store it offline, in multiple locations, and never in a photo, email, or cloud document." },
      { type: "callout", text: "Never enter your seed phrase on any website. No legitimate app or protocol will ever ask for it." },
      { type: "heading", text: "Hot wallets vs. hardware wallets" },
      { type: "paragraph", text: "Hot wallets (browser extensions, mobile apps) are convenient but internet-connected. They are fine for active DeFi use with small amounts." },
      { type: "paragraph", text: "Hardware wallets keep keys offline. Use one for any amount you would not want to lose in a browser compromise." },
      { type: "heading", text: "Approvals: the permission system you need to understand" },
      { type: "paragraph", text: "When you interact with a DeFi protocol, you often sign an approval granting it permission to spend your tokens. Review every approval carefully." },
      { type: "paragraph", text: "Revoke approvals you no longer use. Unlimited approvals are a common attack surface for protocol exploits." },
      { type: "callout", text: "Check your active approvals monthly. Revoke anything from protocols you no longer use." },
    ],
  },

  {
    id: "ins_007",
    slug: "understanding-smart-contracts",
    path: "starter",
    chapter: { slug: "defi-basics", title: "DeFi Basics", order: 1 },
    lesson: { order: 3 },
    title: "Understanding Smart Contracts",
    excerpt: "What smart contracts do, how they replace intermediaries, and what can go wrong.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 7,
    publishedAt: "2026-02-22T10:00:00Z",
    tags: ["Beginner", "Smart Contracts", "DeFi"],
    liveAsset: "ETH",
    ctaLabel: "Explore the App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Code that runs without a middleman" },
      { type: "paragraph", text: "A smart contract is a program that executes automatically when specific conditions are met — no bank, no company, no human approval required." },
      { type: "paragraph", text: "This is what makes DeFi trustless: you are interacting with audited code, not relying on an institution's promise." },
      { type: "callout", text: "Trustless means you verify the code, not just trust a brand. Always check if a protocol has been audited." },
      { type: "heading", text: "Immutability: the double-edged advantage" },
      { type: "paragraph", text: "Once deployed, most smart contracts cannot be changed. This protects users from arbitrary changes — but also means bugs cannot easily be fixed." },
      { type: "paragraph", text: "Look for contracts that have been running without incident for at least 6 months, and check whether they are upgradeable or fully fixed." },
      { type: "heading", text: "What to verify before you interact" },
      { type: "paragraph", text: "Confirm the contract address matches the official protocol documentation. Fake contracts mimic real ones to steal funds." },
      { type: "paragraph", text: "Check audit history, bug bounty programs, and whether the protocol has insurance coverage available." },
      { type: "callout", text: "One minute of address verification has prevented more losses than any other single habit in DeFi." },
    ],
  },

  // ── Starter · Chapter 2: Your First Transaction ───────────────────────────

  {
    id: "ins_008",
    slug: "supplying-your-first-asset",
    path: "starter",
    chapter: { slug: "first-transaction", title: "Your First Transaction", order: 2 },
    lesson: { order: 1 },
    title: "Supplying Your First Asset",
    excerpt: "A step-by-step walkthrough of depositing into a lending pool for the first time.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 9,
    publishedAt: "2026-02-23T10:00:00Z",
    tags: ["Supply", "Lending", "Beginner"],
    liveAsset: "USDC",
    ctaLabel: "Supply in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Choose your first asset deliberately" },
      { type: "paragraph", text: "Start with a stablecoin like USDC or USDT for your first supply. The yield is lower, but there is no price volatility to complicate your learning." },
      { type: "paragraph", text: "Once you understand the mechanics — deposit, accrue interest, withdraw — switch to higher-yield assets." },
      { type: "callout", text: "Understand the process with a boring asset before chasing the interesting APYs." },
      { type: "heading", text: "Walk through the deposit flow" },
      { type: "paragraph", text: "Select the asset, enter the amount, approve the contract (first time only), then confirm the deposit transaction." },
      { type: "paragraph", text: "After confirmation, check your position dashboard to verify the deposit registered and interest is accruing." },
      { type: "heading", text: "What happens to your money" },
      { type: "paragraph", text: "Your deposit enters a shared liquidity pool. Borrowers draw from it, and the interest they pay flows back to depositors like you." },
      { type: "paragraph", text: "{APY} fluctuates based on utilization: when more is borrowed relative to supplied, rates rise for depositors." },
      { type: "callout", text: "Check utilization rate before depositing. High utilization means good rates but also limited instant withdrawal." },
    ],
  },

  {
    id: "ins_009",
    slug: "borrowing-when-it-makes-sense",
    path: "starter",
    chapter: { slug: "first-transaction", title: "Your First Transaction", order: 2 },
    lesson: { order: 2 },
    title: "Borrowing: When It Makes Sense",
    excerpt: "The logic behind DeFi borrowing and how to avoid the most common beginner mistakes.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 10,
    publishedAt: "2026-02-24T10:00:00Z",
    tags: ["Borrow", "Collateral", "Risk"],
    liveAsset: "ETH",
    ctaLabel: "Check Borrow Rates",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Why borrow in DeFi if you already have funds" },
      { type: "paragraph", text: "Borrowing lets you maintain exposure to an asset while unlocking liquidity. You keep your ETH position while accessing stablecoins for other uses." },
      { type: "paragraph", text: "The cost is the interest rate. The risk is liquidation if your {Collateral} loses value and your health factor drops too low." },
      { type: "callout", text: "Never borrow the maximum. Always leave significant buffer between your position and liquidation threshold." },
      { type: "heading", text: "Health factor: your single most important number" },
      { type: "paragraph", text: "Health factor measures how far you are from liquidation. Below 1.0 means you can be liquidated. Keep it above 1.5 as a minimum, 2.0 for safer positions." },
      { type: "paragraph", text: "Monitor it daily if you are borrowing against volatile {Collateral}. Price drops reduce your health factor quickly." },
      { type: "heading", text: "Repaying and managing your position" },
      { type: "paragraph", text: "You can repay at any time with no penalty. Partial repayments raise your health factor immediately." },
      { type: "paragraph", text: "Set a price alert on your collateral asset so you have time to act before approaching the liquidation zone." },
      { type: "callout", text: "Check your health factor every time you check your portfolio, not just when you open a position." },
    ],
  },

  // ── Starter · Chapter 3: Building Good Habits ─────────────────────────────

  {
    id: "ins_010",
    slug: "how-to-review-your-positions",
    path: "starter",
    chapter: { slug: "building-good-habits", title: "Building Good Habits", order: 3 },
    lesson: { order: 1 },
    title: "How to Review Your Positions",
    excerpt: "A weekly review routine that keeps you in control without consuming hours of your time.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 8,
    publishedAt: "2026-02-25T10:00:00Z",
    tags: ["Habits", "Review", "Risk Management"],
    liveAsset: "ETH",
    ctaLabel: "Review Positions in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Build a routine, not a reaction cycle" },
      { type: "paragraph", text: "Checking your DeFi positions only when you are anxious creates reactive decisions. A weekly review at a fixed time creates discipline." },
      { type: "paragraph", text: "The goal is early detection, not constant monitoring. Most position changes are gradual and catch-able with a weekly check." },
      { type: "callout", text: "Schedule 10 minutes every Monday. That is enough to catch 90% of issues before they become emergencies." },
      { type: "heading", text: "The four things to check each week" },
      { type: "paragraph", text: "1. Health factor on borrowed positions. 2. Utilization rate on supplied assets. 3. Any unusual fee accumulation. 4. New protocol announcements or audits." },
      { type: "paragraph", text: "If any metric is outside your pre-defined safe range, decide in advance what action to take — reduce, add collateral, or close." },
      { type: "heading", text: "When to act and when to wait" },
      { type: "paragraph", text: "Not every market move requires action. Overtrading costs gas and often underperforms holding a well-structured position." },
      { type: "paragraph", text: "Act when a position crosses a pre-defined threshold. Do not act on noise, fear, or social media sentiment." },
      { type: "callout", text: "The most important DeFi skill is knowing when to do nothing. Define your thresholds in advance." },
    ],
  },

  {
    id: "ins_011",
    slug: "when-to-scale-up-your-defi-positions",
    path: "starter",
    chapter: { slug: "building-good-habits", title: "Building Good Habits", order: 3 },
    lesson: { order: 2 },
    title: "When to Scale Up Your DeFi Positions",
    excerpt: "The criteria that tell you a strategy is ready for larger capital — and the traps to avoid.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "beginner",
    readTimeMin: 7,
    publishedAt: "2026-02-26T10:00:00Z",
    tags: ["Scaling", "Strategy", "Risk"],
    liveAsset: "ETH",
    ctaLabel: "Explore Markets",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Scale process, not just position size" },
      { type: "paragraph", text: "More capital in a broken process amplifies losses. The prerequisite for scaling is a strategy that has worked consistently at small size." },
      { type: "paragraph", text: "Define what 'worked' means: three clean cycles without unexpected outcomes, all manual reviews completed on schedule." },
      { type: "callout", text: "Never scale during a bull market out of fear of missing out. Scale after proven consistency, not after gains." },
      { type: "heading", text: "The two-step scaling test" },
      { type: "paragraph", text: "Step one: double your position size and continue the same review routine for four weeks without any surprises." },
      { type: "paragraph", text: "Step two: if that passes, double again. At each step, confirm your risk management still works at the new size." },
      { type: "heading", text: "Concentration risk grows with position size" },
      { type: "paragraph", text: "A 1% protocol risk on a $100 position is manageable. The same 1% on a $50,000 position is a $500 loss. Adjust your protocol selection accordingly." },
      { type: "paragraph", text: "Diversify across protocols as you scale. No single protocol should hold more than 40% of your DeFi exposure." },
      { type: "callout", text: "Bigger positions require more conservative protocols, not more aggressive ones." },
    ],
  },

  // ── Yield · Chapter 1: Understanding Yield ────────────────────────────────

  {
    id: "ins_002",
    slug: "apy-vs-apr-practical-framework",
    path: "yield",
    chapter: { slug: "understanding-yield", title: "Understanding Yield", order: 1 },
    lesson: { order: 1 },
    title: "APY vs APR: A Practical Decision Framework",
    excerpt: "How to separate real yield from marketing metrics.",
    coverImage: "/Owl Mascot - Bitcoin - Mint Green.svg",
    difficulty: "intermediate",
    readTimeMin: 10,
    publishedAt: "2026-02-19T10:00:00Z",
    tags: ["Yield", "APY", "Analytics"],
    liveAsset: "USDC",
    ctaLabel: "Compare Yield Options",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Surface metric vs. decision metric" },
      { type: "paragraph", text: "{APY} includes compounding and can look attractive, but only matters if compounding is actually achievable in your workflow." },
      { type: "paragraph", text: "APR is simpler, but often hides the true behavior of strategies that require active maintenance." },
      { type: "callout", text: "Decision rule: compare strategies using expected net annual return, not just displayed APY/APR." },
      { type: "heading", text: "Build your net-yield equation" },
      { type: "paragraph", text: "Start with projected gross return, then subtract gas, bridge fees, slippage, and monitoring overhead." },
      { type: "paragraph", text: "Include time cost if execution requires frequent rebalancing. Complexity is a real cost center." },
      { type: "heading", text: "Stress-test the assumptions" },
      { type: "paragraph", text: "Model optimistic, base, and adverse paths. Small changes in assumptions can erase your edge." },
      { type: "paragraph", text: "If returns collapse under moderate stress, treat the strategy as fragile regardless of headline APY." },
      { type: "callout", text: "Use the calculator below to pressure-test your scenario before allocating more capital." },
    ],
  },

  {
    id: "ins_003",
    slug: "impermanent-loss-under-pressure",
    path: "yield",
    chapter: { slug: "understanding-yield", title: "Understanding Yield", order: 1 },
    lesson: { order: 2 },
    title: "Impermanent Loss Under Volatility",
    excerpt: "When IL becomes critical and which countermeasures work.",
    coverImage: "/Owl Mascot - Bitcoin - Colored.svg",
    difficulty: "advanced",
    readTimeMin: 11,
    publishedAt: "2026-02-18T10:00:00Z",
    tags: ["LP", "Risk", "Yield"],
    liveAsset: "BTC",
    ctaLabel: "Test Strategy in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Where IL starts to hurt in real markets" },
      { type: "paragraph", text: "{Impermanent Loss} accelerates when one side trends hard while the other lags, especially in low-volume windows." },
      { type: "paragraph", text: "High volatility with weak fee capture is the classic trap: your LP position becomes a forced rebalance against momentum." },
      { type: "heading", text: "Map fee income against divergence risk" },
      { type: "paragraph", text: "Estimate expected fee range under calm, active, and chaotic conditions. Compare that against likely divergence." },
      { type: "paragraph", text: "Do not average assumptions across regimes. Volatility clusters, and losses are not linear." },
      { type: "callout", text: "If fee income only outperforms in best-case scenarios, the strategy is not robust enough." },
      { type: "heading", text: "Countermeasures that actually work" },
      { type: "paragraph", text: "Narrow position sizing, faster rebalance cadence, and exposure caps reduce tail damage during trend breakouts." },
      { type: "paragraph", text: "Define an exit trigger before entry. If threshold is hit, execute without negotiation." },
      { type: "callout", text: "Discipline beats prediction: an explicit exit rule protects capital when models fail." },
    ],
  },

  {
    id: "ins_012",
    slug: "when-to-rotate-between-strategies",
    path: "yield",
    chapter: { slug: "understanding-yield", title: "Understanding Yield", order: 1 },
    lesson: { order: 3 },
    title: "When to Rotate Between Strategies",
    excerpt: "The signals that tell you a yield source is degrading and it is time to move on.",
    coverImage: "/Owl Mascot - Bitcoin - Mint Green.svg",
    difficulty: "intermediate",
    readTimeMin: 9,
    publishedAt: "2026-02-27T10:00:00Z",
    tags: ["Rotation", "Strategy", "Yield"],
    liveAsset: "USDC",
    ctaLabel: "Compare Strategies",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Yield degradation is the norm, not the exception" },
      { type: "paragraph", text: "High APYs attract capital. More capital drives rates down. Every yield strategy has a lifecycle — enter early, exit before overcrowding." },
      { type: "paragraph", text: "Rotation is not a failure. It is the natural response to capital efficiency changing over time." },
      { type: "callout", text: "Set a minimum acceptable APY threshold before entering. When rates fall below it, start evaluating alternatives." },
      { type: "heading", text: "Signals that it is time to rotate" },
      { type: "paragraph", text: "{TVL} rising quickly while APY is flat or falling means new capital is diluting returns. That is a rotation signal." },
      { type: "paragraph", text: "Fee income declining relative to pool size, or utilization dropping, are secondary confirmation that conditions have changed." },
      { type: "heading", text: "How to execute rotation without losing gains" },
      { type: "paragraph", text: "Compare net-new return of the candidate strategy against your current one, after fees and gas for the switch." },
      { type: "paragraph", text: "Move in stages if the amounts are significant. Splitting a rotation over two weeks reduces timing risk." },
      { type: "callout", text: "The cost of switching is real. Only rotate when the advantage is clear and sustained, not just a brief spike." },
    ],
  },

  // ── Risk · Chapter 1: Before You Borrow ───────────────────────────────────

  {
    id: "ins_004",
    slug: "liquidation-safe-zones",
    path: "risk",
    chapter: { slug: "before-you-borrow", title: "Before You Borrow", order: 1 },
    lesson: { order: 1 },
    title: "Define Liquidation Safe Zones",
    excerpt: "How to structure lending positions to survive market stress.",
    coverImage: "/Owl Mascot - Colored.svg",
    difficulty: "intermediate",
    readTimeMin: 10,
    publishedAt: "2026-02-17T10:00:00Z",
    tags: ["Risk", "Leverage", "Collateral"],
    liveAsset: "ETH",
    ctaLabel: "Manage Collateral in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Design risk zones before opening size" },
      { type: "paragraph", text: "Define safe, warning, and critical zones around {Liquidation} so decisions are pre-committed under stress." },
      { type: "paragraph", text: "Convert each zone to explicit actions: hold, reduce, add collateral, or close." },
      { type: "heading", text: "Collateral quality over leverage optics" },
      { type: "paragraph", text: "{Collateral} with unstable liquidity or correlated downside increases liquidation risk faster than headline LTV suggests." },
      { type: "paragraph", text: "A lower leverage position with resilient collateral usually outperforms through full market cycles." },
      { type: "callout", text: "Stress test collateral correlation, not just single-asset volatility." },
      { type: "heading", text: "Operational safeguards" },
      { type: "paragraph", text: "Set threshold alerts tied to risk zones, and rehearse your response sequence before alerts fire." },
      { type: "paragraph", text: "Automation can reduce reaction lag, but only if your triggers are conservative and tested." },
      { type: "callout", text: "Your risk plan is only real if it runs fast under pressure." },
    ],
  },

  {
    id: "ins_013",
    slug: "setting-up-alerts-that-actually-work",
    path: "risk",
    chapter: { slug: "before-you-borrow", title: "Before You Borrow", order: 1 },
    lesson: { order: 2 },
    title: "Setting Up Alerts That Actually Work",
    excerpt: "How to configure price and health-factor alerts so you are never caught off guard.",
    coverImage: "/Owl Mascot - Colored.svg",
    difficulty: "intermediate",
    readTimeMin: 8,
    publishedAt: "2026-02-28T10:00:00Z",
    tags: ["Alerts", "Risk Management", "Automation"],
    liveAsset: "ETH",
    ctaLabel: "Set Up Alerts in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Alerts are your risk management system on autopilot" },
      { type: "paragraph", text: "You cannot watch a position 24 hours a day. Alerts convert your risk plan into an automated early warning system." },
      { type: "paragraph", text: "Set them up before you open a position, not after you are already nervous about a price move." },
      { type: "callout", text: "If you would not sleep comfortably without an alert, you need one. Set it now, not later." },
      { type: "heading", text: "The three alert levels to configure" },
      { type: "paragraph", text: "Warning alert at health factor 1.8: time to review and decide. Critical alert at 1.3: time to act immediately." },
      { type: "paragraph", text: "Price alert on collateral asset at -15% and -25% from entry. These map to approximate health factor thresholds for most positions." },
      { type: "heading", text: "Test your alert system before it matters" },
      { type: "paragraph", text: "Trigger a test alert manually to confirm delivery. An alert that fails silently is worse than no alert at all." },
      { type: "paragraph", text: "Use at least two alert channels: on-chain notification and a mobile push notification. Single points of failure are a real risk." },
      { type: "callout", text: "An untested alert is not an alert. Run a dry-fire before you depend on it." },
    ],
  },

  // ── Market · Chapter 1: Reading the Market ────────────────────────────────

  {
    id: "ins_005",
    slug: "tvl-signals-that-matter",
    path: "market",
    chapter: { slug: "reading-the-market", title: "Reading the Market", order: 1 },
    lesson: { order: 1 },
    title: "TVL Signals That Actually Matter",
    excerpt: "How to read TVL in context, not in isolation.",
    coverImage: "/Owl Mascot - Mint Green.svg",
    difficulty: "intermediate",
    readTimeMin: 9,
    publishedAt: "2026-02-16T10:00:00Z",
    tags: ["TVL", "Market", "Signals"],
    liveAsset: "SOL",
    ctaLabel: "Open Markets in App",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "TVL is context, not verdict" },
      { type: "paragraph", text: "{TVL} growth can signal confidence, but it can also be temporary rotation chasing short-lived incentives." },
      { type: "paragraph", text: "Always pair TVL with user activity, retention, and transaction quality to avoid false confidence." },
      { type: "heading", text: "Three-signal readout" },
      { type: "paragraph", text: "Signal one: TVL trend direction. Signal two: participation depth. Signal three: liquidity concentration." },
      { type: "paragraph", text: "If one signal diverges sharply, treat the setup as unstable and reduce conviction." },
      { type: "callout", text: "A balanced signal stack is stronger than a single impressive number." },
      { type: "heading", text: "From signals to action" },
      { type: "paragraph", text: "Translate market data into a playbook: hold, rotate, or wait. Waiting is often the highest-quality action." },
      { type: "paragraph", text: "Document why you acted. Good logs improve future signal interpretation." },
      { type: "callout", text: "Repeatable decision quality is the real edge in volatile markets." },
    ],
  },

  {
    id: "ins_014",
    slug: "how-to-interpret-volume-shifts",
    path: "market",
    chapter: { slug: "reading-the-market", title: "Reading the Market", order: 1 },
    lesson: { order: 2 },
    title: "How to Interpret Volume Shifts",
    excerpt: "Volume tells a different story than price — here is how to read it.",
    coverImage: "/Owl Mascot - Bitcoin - Colored.svg",
    difficulty: "intermediate",
    readTimeMin: 8,
    publishedAt: "2026-03-01T10:00:00Z",
    tags: ["Volume", "Market", "Analysis"],
    liveAsset: "BTC",
    ctaLabel: "Check Market Data",
    ctaHref: "/app",
    blocks: [
      { type: "heading", text: "Volume leads price, not the other way around" },
      { type: "paragraph", text: "Sustained price moves with declining volume often reverse. Volume is the fuel that keeps a trend running." },
      { type: "paragraph", text: "A sharp price spike on low volume is usually a liquidity event, not a new directional trend." },
      { type: "callout", text: "Before acting on a price move, check whether volume supports it. If it does not, wait for confirmation." },
      { type: "heading", text: "On-chain volume vs. spot exchange volume" },
      { type: "paragraph", text: "On-chain volume is harder to fake than centralized exchange data. When both increase together, the signal is stronger." },
      { type: "paragraph", text: "Divergence between on-chain activity and spot price moves often signals smart money acting before the narrative catches up." },
      { type: "heading", text: "Volume patterns worth watching" },
      { type: "paragraph", text: "Volume climax: extreme volume spike at price extremes often marks a reversal point, not a continuation." },
      { type: "paragraph", text: "Quiet accumulation: consistently above-average volume at stable prices suggests positioning before a move." },
      { type: "callout", text: "Context matters: the same volume pattern means different things at all-time highs versus support levels." },
    ],
  },
]

// ── Helper functions ───────────────────────────────────────────────────────────

export function isInsightsPath(value: string): value is InsightsPath {
  return value === "starter" || value === "yield" || value === "risk" || value === "market" || value === "action"
}

export function getInsightsArticles(path?: InsightsPath): InsightsArticle[] {
  if (!path) return insightsArticles
  return insightsArticles.filter((a) => a.path === path)
}

export function getInsightsArticleBySlug(slug: string): InsightsArticle | null {
  return insightsArticles.find((a) => a.slug === slug) ?? null
}

export function getInsightsArticleById(id: string): InsightsArticle | null {
  return insightsArticles.find((a) => a.id === id) ?? null
}

export function getGlossaryTerm(term: string): GlossaryTerm | null {
  const normalized = term.trim().toLowerCase()
  return glossaryTerms.find((entry) => entry.term.toLowerCase() === normalized) ?? null
}

/** Returns chapters for a path, each with their lessons sorted by lesson.order */
export function getChaptersByPath(path: InsightsPath): InsightsChapterMeta[] {
  const articles = insightsArticles.filter((a) => a.path === path)

  const chapterMap = new Map<string, InsightsChapterMeta>()
  for (const article of articles) {
    if (!chapterMap.has(article.chapter.slug)) {
      chapterMap.set(article.chapter.slug, {
        slug: article.chapter.slug,
        title: article.chapter.title,
        order: article.chapter.order,
        path,
        lessons: [],
      })
    }
    chapterMap.get(article.chapter.slug)!.lessons.push(article)
  }

  for (const chapter of chapterMap.values()) {
    chapter.lessons.sort((a, b) => a.lesson.order - b.lesson.order)
  }

  return Array.from(chapterMap.values()).sort((a, b) => a.order - b.order)
}

/** All lessons in the same chapter as the given article, sorted by order */
function getSiblingLessons(article: InsightsArticle): InsightsArticle[] {
  return insightsArticles
    .filter((a) => a.path === article.path && a.chapter.slug === article.chapter.slug)
    .sort((a, b) => a.lesson.order - b.lesson.order)
}

/** Previous lesson: previous in chapter, or last lesson of previous chapter */
export function getPrevLesson(article: InsightsArticle): InsightsArticle | null {
  const siblings = getSiblingLessons(article)
  const idx = siblings.findIndex((a) => a.slug === article.slug)

  if (idx > 0) return siblings[idx - 1]

  // First lesson in chapter — look for previous chapter
  const chapters = getChaptersByPath(article.path)
  const chapterIdx = chapters.findIndex((c) => c.slug === article.chapter.slug)
  if (chapterIdx > 0) {
    const prevChapter = chapters[chapterIdx - 1]
    return prevChapter.lessons.at(-1) ?? null
  }

  return null
}

/** Next lesson: next in chapter, or first lesson of next chapter */
export function getNextLesson(article: InsightsArticle): InsightsArticle | null {
  const siblings = getSiblingLessons(article)
  const idx = siblings.findIndex((a) => a.slug === article.slug)

  if (idx < siblings.length - 1) return siblings[idx + 1]

  // Last lesson in chapter — look for next chapter
  const chapters = getChaptersByPath(article.path)
  const chapterIdx = chapters.findIndex((c) => c.slug === article.chapter.slug)
  if (chapterIdx < chapters.length - 1) {
    return chapters[chapterIdx + 1].lessons[0] ?? null
  }

  return null
}
