import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { authenticateAgentRequest } from '@/lib/agents/auth'
import type { AgentProfile } from '@/types/agents'

async function getVerifiedAddress(req: NextRequest): Promise<string | null> {
  // E2E | Privy | Stellar-wallet session (Stufe 3). For Privy/EVM users this is
  // the lowercased EVM address; Stellar-only users get their G-address.
  const auth = await authenticateAgentRequest(req)
  return auth?.userAddress ?? null
}

function mapProfileRow(row: Record<string, unknown>): AgentProfile {
  return {
    id: row.id as string,
    userAddress: row.user_address as string,
    riskLevel: (row.risk_level as AgentProfile['riskLevel']) ?? 'medium',
    investmentGoal: (row.investment_goal as string) ?? null,
    timeHorizon: (row.time_horizon as AgentProfile['timeHorizon']) ?? null,
    capitalUsd: row.capital_usd != null ? Number(row.capital_usd) : null,
    preferredAssets: (row.preferred_assets as string[]) ?? [],
    preferredChains: (row.preferred_chains as number[]) ?? [],
    onboardingComplete: (row.onboarding_complete as boolean) ?? false,
    autoExecuteEnabled: (row.auto_execute_enabled as boolean) ?? false,
    autoExecuteLimitUsd:
      row.auto_execute_limit_usd != null ? Number(row.auto_execute_limit_usd) : 2,
    autoExecuteActions:
      (row.auto_execute_actions as string[]) ?? ['deposit', 'withdraw', 'pay_back'],
    autoExecutePromptedAt: (row.auto_execute_prompted_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** GET — Fetch the user's agent profile (creates default if none exists) */
export async function GET(req: NextRequest) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Upsert: create default profile if none exists
  const rows = await sql`
    INSERT INTO agent_profiles (user_address)
    VALUES (${address})
    ON CONFLICT (user_address) DO NOTHING
    RETURNING *
  `

  // If ON CONFLICT hit, fetch existing
  let profile
  if (rows.length > 0) {
    profile = rows[0]
  } else {
    const existing = await sql`
      SELECT * FROM agent_profiles
      WHERE LOWER(user_address) = ${address}
      LIMIT 1
    `
    profile = existing[0]
  }

  if (!profile) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }

  return NextResponse.json({ profile: mapProfileRow(profile) })
}

/** PUT — Update the user's agent profile */
export async function PUT(req: NextRequest) {
  const address = await getVerifiedAddress(req)
  if (!address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate fields
  const validRiskLevels = ['low', 'medium', 'high']
  const validTimeHorizons = ['short', 'medium', 'long']
  // Fintech action vocabulary from Phase-2 plan. Mirror of AGENT_EXECUTION_PLAN.md.
  // Borrow / adjust_strategy / rebalance are rejected by `shouldAutoExecute` at
  // execute-time; we still accept them here if the UI ever wants to render an
  // "allow list" that includes them (read-only badge), but the server-side
  // consent gate is authoritative.
  const validAutoActions = [
    'deposit', 'withdraw', 'pay_back', 'borrow', 'convert',
    'adjust_strategy', 'rebalance', 'supply', 'repay', 'swap',
  ]

  if (body.riskLevel && !validRiskLevels.includes(body.riskLevel as string)) {
    return NextResponse.json({ error: 'Invalid riskLevel' }, { status: 400 })
  }
  if (body.timeHorizon && !validTimeHorizons.includes(body.timeHorizon as string)) {
    return NextResponse.json({ error: 'Invalid timeHorizon' }, { status: 400 })
  }
  if (body.capitalUsd != null && (typeof body.capitalUsd !== 'number' || body.capitalUsd < 0)) {
    return NextResponse.json({ error: 'Invalid capitalUsd' }, { status: 400 })
  }
  if (body.preferredAssets && !Array.isArray(body.preferredAssets)) {
    return NextResponse.json({ error: 'preferredAssets must be an array' }, { status: 400 })
  }
  if (body.preferredChains && !Array.isArray(body.preferredChains)) {
    return NextResponse.json({ error: 'preferredChains must be an array' }, { status: 400 })
  }
  if (
    body.autoExecuteLimitUsd != null &&
    (typeof body.autoExecuteLimitUsd !== 'number' ||
      body.autoExecuteLimitUsd < 0 ||
      body.autoExecuteLimitUsd > 10_000)
  ) {
    return NextResponse.json(
      { error: 'autoExecuteLimitUsd must be between 0 and 10000' },
      { status: 400 },
    )
  }
  if (body.autoExecuteActions) {
    if (!Array.isArray(body.autoExecuteActions)) {
      return NextResponse.json(
        { error: 'autoExecuteActions must be an array' },
        { status: 400 },
      )
    }
    const bad = (body.autoExecuteActions as unknown[]).filter(
      (a) => typeof a !== 'string' || !validAutoActions.includes(a),
    )
    if (bad.length > 0) {
      return NextResponse.json(
        { error: `Invalid autoExecuteActions: ${bad.join(', ')}` },
        { status: 400 },
      )
    }
  }

  // Upsert profile. Consent fields are only written when the client sent them
  // (otherwise defaults + COALESCE keep the existing row untouched).
  const nextAutoEnabled =
    body.autoExecuteEnabled != null ? (body.autoExecuteEnabled as boolean) : null
  const nextAutoLimit =
    body.autoExecuteLimitUsd != null ? (body.autoExecuteLimitUsd as number) : null
  const nextAutoActions =
    body.autoExecuteActions != null ? (body.autoExecuteActions as string[]) : null
  const nextPromptedAt =
    body.autoExecutePromptedAt != null
      ? new Date(body.autoExecutePromptedAt as string)
      : null

  const rows = await sql`
    INSERT INTO agent_profiles (
      user_address, risk_level, investment_goal, time_horizon,
      capital_usd, preferred_assets, preferred_chains, onboarding_complete,
      auto_execute_enabled, auto_execute_limit_usd, auto_execute_actions, auto_execute_prompted_at
    ) VALUES (
      ${address},
      ${(body.riskLevel as string) ?? 'medium'},
      ${(body.investmentGoal as string) ?? null},
      ${(body.timeHorizon as string) ?? null},
      ${body.capitalUsd != null ? body.capitalUsd as number : null},
      ${(body.preferredAssets as string[]) ?? []},
      ${(body.preferredChains as number[]) ?? []},
      ${(body.onboardingComplete as boolean) ?? false},
      ${nextAutoEnabled ?? false},
      ${nextAutoLimit ?? 2},
      ${nextAutoActions ?? ['deposit', 'withdraw', 'pay_back']},
      ${nextPromptedAt}
    )
    ON CONFLICT (user_address) DO UPDATE SET
      risk_level = COALESCE(EXCLUDED.risk_level, agent_profiles.risk_level),
      investment_goal = COALESCE(EXCLUDED.investment_goal, agent_profiles.investment_goal),
      time_horizon = COALESCE(EXCLUDED.time_horizon, agent_profiles.time_horizon),
      capital_usd = COALESCE(EXCLUDED.capital_usd, agent_profiles.capital_usd),
      preferred_assets = COALESCE(EXCLUDED.preferred_assets, agent_profiles.preferred_assets),
      preferred_chains = COALESCE(EXCLUDED.preferred_chains, agent_profiles.preferred_chains),
      onboarding_complete = COALESCE(EXCLUDED.onboarding_complete, agent_profiles.onboarding_complete),
      auto_execute_enabled = CASE
        WHEN ${nextAutoEnabled !== null} THEN EXCLUDED.auto_execute_enabled
        ELSE agent_profiles.auto_execute_enabled
      END,
      auto_execute_limit_usd = CASE
        WHEN ${nextAutoLimit !== null} THEN EXCLUDED.auto_execute_limit_usd
        ELSE agent_profiles.auto_execute_limit_usd
      END,
      auto_execute_actions = CASE
        WHEN ${nextAutoActions !== null} THEN EXCLUDED.auto_execute_actions
        ELSE agent_profiles.auto_execute_actions
      END,
      auto_execute_prompted_at = COALESCE(EXCLUDED.auto_execute_prompted_at, agent_profiles.auto_execute_prompted_at)
    RETURNING *
  `

  return NextResponse.json({ profile: mapProfileRow(rows[0]) })
}
