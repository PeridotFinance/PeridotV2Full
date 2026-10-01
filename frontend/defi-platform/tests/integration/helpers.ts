/**
 * Shared helpers for E2E integration tests.
 *
 * Extracts common patterns from bsc-lending.test.ts into reusable functions:
 * - sendTx: write a contract call and wait for receipt
 * - getBalanceSnapshot / logBalanceDiff: before/after balance comparison
 * - refreshOraclePrices / verifyAssetsInOracle: oracle pre-flight checks
 * - wrapBnbIfNeeded: wrap native BNB → WBNB for supply tests
 */

import { formatUnits } from 'viem'
import { account, publicClient, walletClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI, ORACLE_ABI, WBNB_ABI } from './abis'
import {
  ORACLE,
  PERIDOT_CONTROLLER,
  IGNORED_UNDERLYINGS,
  MARKETS,
  type MarketConfig,
} from './constants'

// ─── sendTx ──────────────────────────────────────────────────────────────────

export async function sendTx(
  request: Parameters<typeof walletClient.writeContract>[0],
  label?: string,
) {
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 45_000,
  })
  if (label) {
    console.log(`  ${label}: ${hash} (gas: ${receipt.gasUsed})`)
  }
  return receipt
}

// ─── Balance snapshots ───────────────────────────────────────────────────────

export interface MarketBalance {
  underlying: bigint
  pToken: bigint
  borrow: bigint
}

export interface BalanceSnapshot {
  nativeBnb: bigint
  markets: Record<string, MarketBalance>
}

export async function getBalanceSnapshot(
  marketKeys: string[],
): Promise<BalanceSnapshot> {
  const nativeBnb = await publicClient.getBalance({ address: account.address })

  const markets: Record<string, MarketBalance> = {}
  for (const key of marketKeys) {
    const m = MARKETS[key]
    if (!m) continue

    const [underlying, pToken, borrow] = await Promise.all([
      publicClient.readContract({
        address: m.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      }),
      publicClient.readContract({
        address: m.pToken,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      }),
      publicClient.readContract({
        address: m.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      }),
    ])

    markets[key] = { underlying, pToken, borrow }
  }

  return { nativeBnb, markets }
}

export function logBalanceDiff(
  label: string,
  before: BalanceSnapshot,
  after: BalanceSnapshot,
) {
  const bnbDiff = after.nativeBnb - before.nativeBnb
  console.log(`\n  ${label} balance diff:`)
  console.log(`    BNB: ${formatUnits(before.nativeBnb, 18)} → ${formatUnits(after.nativeBnb, 18)} (${bnbDiff >= 0n ? '+' : ''}${formatUnits(bnbDiff, 18)})`)

  for (const key of Object.keys(before.markets)) {
    const b = before.markets[key]
    const a = after.markets[key]
    if (!b || !a) continue
    const m = MARKETS[key]
    const d = m?.decimals ?? 18

    const uDiff = a.underlying - b.underlying
    const pDiff = a.pToken - b.pToken
    const bDiff = a.borrow - b.borrow

    console.log(`    ${key}: underlying ${uDiff >= 0n ? '+' : ''}${formatUnits(uDiff, d)}, pToken ${pDiff >= 0n ? '+' : ''}${pDiff}, borrow ${bDiff >= 0n ? '+' : ''}${formatUnits(bDiff, d)}`)
  }
}

// ─── Oracle helpers ──────────────────────────────────────────────────────────

export async function refreshOraclePrices(underlyings: `0x${string}`[]) {
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: ORACLE,
      abi: ORACLE_ABI,
      functionName: 'updateChainlinkPrices',
      args: [underlyings],
    })
    const r = await sendTx(request, 'updateChainlinkPrices')
    return r
  } catch (e: any) {
    console.warn(`  updateChainlinkPrices warning: ${e.shortMessage ?? e.message}`)
  }
}

export async function verifyAssetsInOracle() {
  const assetsIn = (await publicClient.readContract({
    address: PERIDOT_CONTROLLER,
    abi: PERIDOTTROLLER_ABI,
    functionName: 'getAssetsIn',
    args: [account.address],
  })) as readonly `0x${string}`[]

  for (const pt of assetsIn) {
    const underlying = (await publicClient.readContract({
      address: pt,
      abi: PTOKEN_ABI,
      functionName: 'underlying',
    })) as `0x${string}`

    if (IGNORED_UNDERLYINGS.has(underlying.toLowerCase())) {
      console.log(`  Skipping ignored market ${pt} (underlying ${underlying})`)
      continue
    }

    const price = await publicClient.readContract({
      address: ORACLE,
      abi: ORACLE_ABI,
      functionName: 'getUnderlyingPrice',
      args: [pt],
    })

    if (price === 0n) {
      throw new Error(
        `Market ${pt} in assetsIn has oracle price 0.\n` +
          `This blocks redeem for the entire account (Peridottroller error 13).\n` +
          `Run: pnpm test:integration:cleanup`,
      )
    }
  }
}

// ─── WBNB wrapping ───────────────────────────────────────────────────────────

export async function wrapBnbIfNeeded(amount: bigint) {
  const wbnb = MARKETS.WBNB
  if (!wbnb) throw new Error('WBNB market not configured')

  const wbnbBalance = await publicClient.readContract({
    address: wbnb.underlying,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })

  if (wbnbBalance >= amount) {
    console.log(`  WBNB balance sufficient: ${formatUnits(wbnbBalance, 18)}`)
    return
  }

  const deficit = amount - wbnbBalance
  console.log(`  Wrapping ${formatUnits(deficit, 18)} BNB → WBNB...`)

  const hash = await walletClient.writeContract({
    address: wbnb.underlying,
    abi: WBNB_ABI,
    functionName: 'deposit',
    value: deficit,
    chain: walletClient.chain,
  } as any)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 45_000,
  })
  console.log(`  WBNB deposit: ${hash} (gas: ${receipt.gasUsed})`)
}
