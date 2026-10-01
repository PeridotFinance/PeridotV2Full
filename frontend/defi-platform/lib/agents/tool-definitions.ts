/**
 * Tool definitions for the Anthropic API tool_use feature.
 * Each tool maps to a server-side executor in tool-executor.ts.
 */

export const AGENT_TOOLS = [
  {
    name: 'get_peridot_markets',
    description:
      'Get current Peridot lending pool data including live APY, TVL, utilization rate, and risk metrics for a specific chain or all chains.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chainId: {
          type: 'number',
          description:
            'Optional chain ID to filter pools. Omit to get pools across all chains. Common: 56 (BSC), 10143 (Monad), 50312 (Somnia).',
        },
        assetSymbol: {
          type: 'string',
          description: 'Optional asset symbol to filter (e.g. "USDC", "ETH", "BNB").',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_user_portfolio',
    description:
      "Get the user's current on-chain positions across all supported chains, including supplied and borrowed balances, APY earned, and collateral status.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'project_my_earnings',
    description:
      "Project FORWARD how much the user will have / earn on their existing deposits over a future window. Uses their actual current principal and current APY (with daily compounding). Returns a chart and a headline number. Use for 'how much will I have in 30 days?', 'what will my deposit be worth next year?', 'project my returns'. When the user names a specific asset, pass it via assetSymbol so projection focuses on just that. PREFER over `calculate_earnings` for ANY question that references the user's own money — calculate_earnings is for hypothetical / what-if questions on amounts the user names directly.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description:
            "Filter to a single asset (e.g. 'USDC', 'USDT'). Omit to project across the user's entire deposit base.",
        },
        days: {
          type: 'number',
          description: 'Forward window in days. Default 365. Capped at 1825 (5y).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_user_earnings',
    description:
      "Get how much the user has actually EARNED on their deposits — total $ income and per-asset breakdown, plus effective annualized rate. Use this for any 'how much have I earned/made/gained (on X)?', 'what's my interest income?', or 'what are my returns so far?' question. PREFER over `get_user_portfolio` for earnings questions — portfolio shows current balances, this shows realized returns. When the user names a specific asset (USDC, USDT, ETH, etc.), pass it via assetSymbol so the response focuses on just that asset.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description:
            "Filter to a single asset (e.g. 'USDC', 'USDT', 'ETH'). Omit to get the full breakdown across every asset the user has earned on.",
        },
      },
      required: [],
    },
  },
  {
    name: 'compare_my_rate',
    description:
      "Compare the user's CURRENT rate on an asset they already hold vs. the best Peridot rate available right now. Returns the delta plus an annual $-difference on their actual principal. Use for 'am I on the best rate?', 'can I do better with my X?', 'is my USDC in the right pool?'. Returns an alert card and quick-reply chips (move funds / compare alternatives). Requires assetSymbol — without it, fall back to `get_user_portfolio`.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: "The asset to compare (e.g. 'USDC', 'USDT', 'ETH'). Required.",
        },
      },
      required: ['assetSymbol'],
    },
  },
  {
    name: 'get_pool_registry',
    description:
      'Query the full pool registry including both Peridot and external protocol pools (Aave, Compound, Curve). Returns APY, risk tier, and interaction details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        protocol: {
          type: 'string',
          description:
            'Filter by protocol name: "peridot", "aave_v3", "compound_v3", "curve". Omit for all.',
        },
        riskTier: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Filter by risk tier.',
        },
        chainId: {
          type: 'number',
          description: 'Filter by chain ID.',
        },
      },
      required: [],
    },
  },
  {
    name: 'build_strategy_proposal',
    description:
      'Build a strategy allocation proposal based on risk level and available capital. Returns a structured proposal with allocation percentages, blended APY, and reasoning. The user must approve before execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        riskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'The risk profile for the strategy.',
        },
        capitalUsd: {
          type: 'number',
          description: 'Total capital in USD to allocate.',
        },
        preferredAssets: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of preferred asset symbols (e.g. ["USDC", "ETH"]). The strategy will favor these.',
        },
        preferredChains: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional list of preferred chain IDs.',
        },
      },
      required: ['riskLevel', 'capitalUsd'],
    },
  },
  {
    name: 'update_user_profile',
    description:
      "Update the user's investment profile preferences. Use this after gathering their risk tolerance, investment goals, and capital during onboarding or when they explicitly ask to change preferences.",
    input_schema: {
      type: 'object' as const,
      properties: {
        riskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'The risk tolerance level.',
        },
        investmentGoal: {
          type: 'string',
          description:
            'Investment goal: "passive income", "growth", "capital preservation", or a custom description.',
        },
        timeHorizon: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description:
            'Investment time horizon: "short" (<3 months), "medium" (3-12 months), "long" (>12 months).',
        },
        capitalUsd: {
          type: 'number',
          description: 'Approximate total capital in USD the user wants to deploy.',
        },
        preferredAssets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred asset symbols (e.g. ["USDC", "ETH"]).',
        },
        preferredChains: {
          type: 'array',
          items: { type: 'number' },
          description: 'Preferred chain IDs (e.g. [56, 10143]).',
        },
      },
      required: ['riskLevel'],
    },
  },
  // ── Cross-Session Knowledge ──────────────────────────────────────
  {
    name: 'remember_fact',
    description:
      'Save an important fact about the user for future conversations. Use this when the user states a strong preference, constraint, or important context (e.g. "I never want to hold DOGE", "I\'m based in Germany", "My tax year ends in March").',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description:
            'A short, descriptive key for the fact (e.g. "excluded_assets", "country", "tax_year_end"). Use snake_case.',
        },
        value: {
          type: 'string',
          description: 'The fact value. Can be a string, comma-separated list, or short sentence.',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'recall_facts',
    description:
      "Retrieve stored facts about the user from previous conversations. Use this to check user preferences before making recommendations.",
    input_schema: {
      type: 'object' as const,
      properties: {
        keyFilter: {
          type: 'string',
          description: 'Optional key prefix to filter facts (e.g. "excluded" to find "excluded_assets"). Omit to get all facts.',
        },
      },
      required: [],
    },
  },
  // ── Rebalancing ─────────────────────────────────────────────────
  {
    name: 'analyze_rebalance',
    description:
      "Analyze the user's current portfolio vs. their target strategy and suggest rebalancing actions. Shows drift per position and proposes withdraw/supply moves to restore target allocations.",
    input_schema: {
      type: 'object' as const,
      properties: {
        targetAllocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assetSymbol: { type: 'string' },
              targetPercentage: { type: 'number' },
              chainId: { type: 'number' },
            },
            required: ['assetSymbol', 'targetPercentage'],
          },
          description: 'Target allocation percentages. If omitted, uses the last approved strategy proposal.',
        },
        driftThreshold: {
          type: 'number',
          description: 'Minimum drift percentage to trigger a rebalance suggestion (default: 5%).',
        },
      },
      required: [],
    },
  },
  // ── Risk Monitoring ─────────────────────────────────────────────
  {
    name: 'check_liquidation_risk',
    description:
      "Check the user's borrow positions for liquidation risk. Calculates current LTV ratio vs. liquidation threshold for each position and warns if any are approaching danger.",
    input_schema: {
      type: 'object' as const,
      properties: {
        chainId: {
          type: 'number',
          description: 'Optional chain ID to check. Omit for all chains.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_market_conditions',
    description:
      'Get recent APY trends and market conditions for Peridot pools. Returns 7-day APY history data suitable for chart visualization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Asset symbol to check (e.g. "USDC", "ETH"). Required.',
        },
        chainId: {
          type: 'number',
          description: 'Chain ID (default: 56 for BSC).',
        },
        days: {
          type: 'number',
          description: 'Number of days of history (default: 7, max: 30).',
        },
      },
      required: ['assetSymbol'],
    },
  },
  // ── Utility Tools ───────────────────────────────────────────────
  {
    name: 'get_transaction_history',
    description:
      "Get the user's recent verified transactions across all chains. Shows supply, borrow, repay, and redeem actions with amounts and timestamps.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of transactions to return (default: 10, max: 50).',
        },
        actionType: {
          type: 'string',
          enum: ['supply', 'borrow', 'repay', 'redeem'],
          description: 'Optional filter by action type.',
        },
      },
      required: [],
    },
  },
  {
    name: 'compare_pools',
    description:
      'Side-by-side comparison of two pools. Returns APY, TVL, risk tier, utilization, and chain for each.',
    input_schema: {
      type: 'object' as const,
      properties: {
        poolA: {
          type: 'string',
          description: 'First pool identifier: "protocol:asset:chainId" (e.g. "peridot:USDC:56").',
        },
        poolB: {
          type: 'string',
          description: 'Second pool identifier: "protocol:asset:chainId" (e.g. "aave_v3:USDC:56").',
        },
      },
      required: ['poolA', 'poolB'],
    },
  },
  {
    name: 'calculate_earnings',
    description:
      'Project future earnings for a given allocation over a specified number of days. Uses current APY rates to estimate returns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        capitalUsd: {
          type: 'number',
          description: 'Capital in USD to project earnings for.',
        },
        apy: {
          type: 'number',
          description: 'Annual percentage yield (e.g. 8.5 for 8.5%).',
        },
        days: {
          type: 'number',
          description: 'Number of days to project (default: 30).',
        },
        compounding: {
          type: 'boolean',
          description: 'Whether to compound daily (default: true).',
        },
      },
      required: ['capitalUsd', 'apy'],
    },
  },
  // ── Cross-Chain Biconomy ─────────────────────────────────────────
  {
    name: 'execute_cross_chain_supply',
    description:
      'Build a cross-chain supply transaction via Biconomy. Bridges tokens from the source chain to BSC and supplies them to a Peridot market. Returns an ActionButtonBlock for user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sourceChainId: {
          type: 'number',
          description:
            'Chain ID where the user\'s tokens currently are (e.g. 1 for Ethereum, 42161 for Arbitrum, 137 for Polygon, 8453 for Base, 43114 for Avalanche).',
        },
        assetSymbol: {
          type: 'string',
          description: 'Asset to supply (e.g. "USDC", "WETH", "USDT").',
        },
        amount: {
          type: 'string',
          description: 'Amount to supply in human-readable format (e.g. "100", "0.5").',
        },
        enableCollateral: {
          type: 'boolean',
          description: 'Whether to enable the supplied asset as collateral (default: true).',
        },
      },
      required: ['sourceChainId', 'assetSymbol', 'amount'],
    },
  },
  // ── Single-Action Deposit / Withdraw / Pay-back ─────────────────
  // These are the simplest happy-path tools. Use them for a single-asset
  // action on the hub chain where the user's intent is unambiguous. For
  // cross-chain (assets on a spoke chain), use `execute_cross_chain_supply`.
  {
    name: 'execute_deposit',
    description:
      'Propose a single-asset deposit into a Peridot pool on a hub chain. Persists an action and returns an ActionButtonBlock. Use this for same-chain deposits (user already has the asset on BSC/Monad). For cross-chain, use execute_cross_chain_supply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Asset to deposit (e.g. "USDC", "USDT", "WETH").',
        },
        amount: {
          type: 'string',
          description: 'Amount to deposit in human-readable format (e.g. "1", "0.5").',
        },
        chainId: {
          type: 'number',
          description: 'Hub chain ID. 56 (BSC), 143 (Monad) supported.',
        },
      },
      required: ['assetSymbol', 'amount', 'chainId'],
    },
  },
  {
    name: 'execute_withdraw',
    description:
      'Propose a single-asset withdrawal from a Peridot pool. Persists an action and returns an ActionButtonBlock. Only withdraws funds the user has deposited. The block renders in the Auto-Execute inline card if the user has opted in and the amount is within their limit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Asset to withdraw (e.g. "USDC", "USDT").',
        },
        amount: {
          type: 'string',
          description: 'Amount to withdraw in human units.',
        },
        chainId: {
          type: 'number',
          description: 'Chain ID of the Peridot market.',
        },
      },
      required: ['assetSymbol', 'amount', 'chainId'],
    },
  },
  {
    name: 'execute_pay_back',
    description:
      'Propose a single-asset loan repayment. Persists an action and returns an ActionButtonBlock. Requires the asset to be in the user\'s wallet (not just deposited).',
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Asset to repay (must match the outstanding borrow).',
        },
        amount: {
          type: 'string',
          description: 'Amount to repay in human units.',
        },
        chainId: {
          type: 'number',
          description: 'Chain ID of the loan.',
        },
      },
      required: ['assetSymbol', 'amount', 'chainId'],
    },
  },
  // ── Stellar lending (Soroban) ───────────────────────────────────
  // Only valid when the user has a Stellar wallet connected (see the Stellar
  // section of the system prompt). These act on the Stellar Soroban markets,
  // NOT on any EVM chain — there is no chainId. The transaction is built,
  // signed (via the user's Stellar wallet) and submitted on confirm.
  {
    name: 'execute_stellar_deposit',
    description:
      "Propose a deposit into a Peridot Stellar (Soroban) market. ONLY for users with a Stellar wallet — never call this for an EVM deposit (use execute_deposit). Returns an ActionButtonBlock the user confirms; signing happens with their Stellar wallet. No chainId — Stellar only.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Stellar asset to deposit: "USDC", "XLM", or "EURC".',
        },
        amount: {
          type: 'string',
          description: 'Amount to deposit in human-readable units (e.g. "100", "0.5").',
        },
      },
      required: ['assetSymbol', 'amount'],
    },
  },
  {
    name: 'execute_stellar_withdraw',
    description:
      "Propose a withdrawal from a Peridot Stellar (Soroban) market. ONLY for users with a Stellar wallet. Withdraws funds the user has deposited on Stellar. Returns an ActionButtonBlock; signing happens with their Stellar wallet. No chainId — Stellar only.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Stellar asset to withdraw: "USDC", "XLM", or "EURC".',
        },
        amount: {
          type: 'string',
          description: 'Amount to withdraw in human-readable underlying units.',
        },
      },
      required: ['assetSymbol', 'amount'],
    },
  },
  {
    name: 'execute_stellar_pay_back',
    description:
      "Propose a loan repayment on a Peridot Stellar (Soroban) market. ONLY for users with a Stellar wallet. Requires the asset to be in the user's Stellar wallet. Returns an ActionButtonBlock; signing happens with their Stellar wallet. No chainId — Stellar only.",
    input_schema: {
      type: 'object' as const,
      properties: {
        assetSymbol: {
          type: 'string',
          description: 'Stellar asset to repay: "USDC", "XLM", or "EURC".',
        },
        amount: {
          type: 'string',
          description: 'Amount to repay in human-readable units.',
        },
      },
      required: ['assetSymbol', 'amount'],
    },
  },
  // ── Swap / Convert (Phase 6.1) ──────────────────────────────────
  {
    name: 'execute_swap',
    description:
      'Propose a token conversion (swap) on a single chain. Fetches a Bitget router quote and returns an ActionButtonBlock. Use for converting between stablecoins or into an asset the user wants to deposit. Same-chain only — for cross-chain, use execute_cross_chain_supply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromAssetSymbol: {
          type: 'string',
          description: 'Asset the user is converting FROM (e.g. "USDC").',
        },
        toAssetSymbol: {
          type: 'string',
          description: 'Asset the user is converting TO (e.g. "USDT").',
        },
        amount: {
          type: 'string',
          description: 'Amount of fromAssetSymbol in human-readable format (e.g. "10").',
        },
        chainId: {
          type: 'number',
          description: 'Chain ID where the swap happens. Hub chains only (56 BSC, 143 Monad).',
        },
        slippageBps: {
          type: 'number',
          description: 'Slippage tolerance in basis points (50 = 0.5%). Default 50.',
        },
      },
      required: ['fromAssetSymbol', 'toAssetSymbol', 'amount', 'chainId'],
    },
  },
  // ── Rebalance / Adjust Strategy (Phase 6.1) ─────────────────────
  {
    name: 'execute_rebalance',
    description:
      'Propose a rebalance on a single chain — withdraw from one or more Peridot positions and deposit into one or more others. Use when the user wants to move funds between pools (e.g. chasing better APY) on the same chain. Returns an ActionButtonBlock; Smart Account users get a single-signature batch, EOA users sign sequentially.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chainId: {
          type: 'number',
          description: 'Chain ID where both the withdraw and deposit happen.',
        },
        withdrawFrom: {
          type: 'array',
          description: 'Positions to withdraw from. Usually 1-2 legs.',
          items: {
            type: 'object',
            properties: {
              assetSymbol: { type: 'string', description: 'Asset to withdraw (e.g. "USDC").' },
              amount: { type: 'string', description: 'Amount to withdraw in human units.' },
            },
            required: ['assetSymbol', 'amount'],
          },
        },
        depositInto: {
          type: 'array',
          description: 'Destinations to deposit into. Usually 1 leg.',
          items: {
            type: 'object',
            properties: {
              assetSymbol: { type: 'string', description: 'Asset to deposit (e.g. "USDT").' },
              amount: { type: 'string', description: 'Amount to deposit in human units.' },
            },
            required: ['assetSymbol', 'amount'],
          },
        },
      },
      required: ['chainId', 'withdrawFrom', 'depositInto'],
    },
  },
  // ── Leaderboard ─────────────────────────────────────────────────
  {
    name: 'verify_for_leaderboard',
    description:
      'Submit a completed transaction for leaderboard points verification. Call this after a user\'s transaction has been confirmed on-chain to earn them points. Returns the points awarded.',
    input_schema: {
      type: 'object' as const,
      properties: {
        txHash: {
          type: 'string',
          description: 'The on-chain transaction hash (0x...).',
        },
        chainId: {
          type: 'number',
          description: 'Chain ID where the transaction was executed.',
        },
        actionType: {
          type: 'string',
          enum: ['supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply'],
          description: 'Type of the transaction action.',
        },
      },
      required: ['txHash', 'chainId'],
    },
  },
  {
    name: 'check_action_status',
    description:
      "Look up the live lifecycle state of a specific agent-initiated action (deposit/withdraw/etc) — returns status (pending/bridging/executing/succeeded/failed/timeout), time elapsed, backend hash, and any error. Use this when the user asks 'did my deposit arrive?' or 'is my transfer done?'. The `id` is returned by the tools that create actions. When unsure which action the user means, call `list_recent_actions` first and pick by intent.",
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the agent action (returned by the tool that created it).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_recent_actions',
    description:
      "List the user's recent agent-initiated actions (default: last 10 minutes). Returns each action's id, intent (deposit/withdraw/etc), asset, amount, current status, and elapsed time. Use this when the user refers to an earlier action without a specific id ('did it arrive?', 'was the deposit from earlier done?'). Prefer this over `get_user_portfolio` for flow-in-progress questions — portfolio only shows settled positions, not mid-flight transfers.",
    input_schema: {
      type: 'object' as const,
      properties: {
        windowMinutes: {
          type: 'number',
          description: 'Optional lookback window in minutes (default 10, max 60). Expand when the user asks about older actions.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of actions to return (default 10, max 25).',
        },
      },
      required: [],
    },
  },
] as const

export type AgentToolName = (typeof AGENT_TOOLS)[number]['name']

// ── Wallet-less Support Mode ──────────────────────────────────────────────
// The Peridot support chat (SupportChat.tsx) reuses the same agent but without
// a wallet requirement. To keep the surface safe we only expose pure-info /
// read-only tools — no execute_*, no profile-mutating tools, no wallet-scoped
// portfolio reads. With wallet, we additionally allow read-only portfolio
// tools so the agent can answer "what am I earning?"-type questions. Execute
// tools are NEVER exposed in support — that flow belongs in /chat.

/** Pure-info tools — no wallet needed, no user data accessed. */
export const SUPPORT_PUBLIC_TOOL_NAMES: ReadonlySet<AgentToolName> = new Set<AgentToolName>([
  'get_peridot_markets',
  'get_pool_registry',
  'get_market_conditions',
  'compare_pools',
  'calculate_earnings',
])

/** Read-only wallet-scoped tools — added on top of the public set when a wallet is present. */
export const SUPPORT_WALLET_TOOL_NAMES: ReadonlySet<AgentToolName> = new Set<AgentToolName>([
  'get_user_portfolio',
  'get_user_earnings',
  'project_my_earnings',
  'compare_my_rate',
  'check_liquidation_risk',
  'get_transaction_history',
  'analyze_rebalance',
  'recall_facts',
  'list_recent_actions',
  'check_action_status',
])

/** Build the tool subset for the support modal. */
export function getSupportTools(walletAvailable: boolean): typeof AGENT_TOOLS[number][] {
  const allowed = walletAvailable
    ? new Set<AgentToolName>([...SUPPORT_PUBLIC_TOOL_NAMES, ...SUPPORT_WALLET_TOOL_NAMES])
    : SUPPORT_PUBLIC_TOOL_NAMES
  return AGENT_TOOLS.filter((t) => allowed.has(t.name as AgentToolName))
}
