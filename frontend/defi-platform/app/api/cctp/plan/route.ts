/**
 * POST /api/cctp/plan — the calldata for a cross-chain deposit, and the last
 * chance to refuse one.
 *
 * The client could build this itself; it deliberately does not, for two reasons.
 *
 * The first is the encoding. `hookData` carries the user's Stellar address in an
 * 88-byte envelope, and the mint recipient is a StrKey-decoded contract id — get
 * either wrong and the burn still succeeds, the USDC still leaves the source
 * chain, and it lands somewhere nobody can retrieve it from. That belongs in one
 * place with one set of tests, not in a bundle. It also keeps
 * `@stellar/stellar-sdk` (which `lib/cctp/burn.ts` needs for StrKey) out of the
 * browser entirely.
 *
 * The second is the gate. A burn is irreversible the moment it is mined, so the
 * trustline must be verified *before* the user is handed something to sign — and
 * a check the client performs on itself is a check the client can skip. Here it
 * cannot: no trustline, no calldata.
 *
 * This route signs nothing and moves nothing. It hands back an approve and a
 * burn for the user's own wallet to execute.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { buildBurnPlan } from "@/lib/cctp/burn"
import { checkCctpRecipient, describeCctpBlocker } from "@/lib/cctp/trustline"
import { CCTP_MIN_TRANSFER_USD } from "@/config/cctp"
import { isCrossChainDepositEnabled } from "@/config/crossChainDeposit"
import { isRelayerConfigured } from "@/lib/cctp/relay"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
/** USDC has 6 decimals on every CCTP source chain. */
const USDC_UNIT = BigInt(1_000_000)

export async function POST(req: NextRequest) {
  // The kill switch, at the only place that can start one. Transfers already in
  // flight keep being relayed — see config/crossChainDeposit.ts.
  if (!isCrossChainDepositEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 503 })
  }
  // No relayer, no deposits. The burn would succeed and then nobody would
  // submit the mint on Stellar — the user's USDC would sit at the forwarder
  // until the key is configured. A deployment that forgets the secret must
  // fail here, loudly and before anyone signs, not silently downstream.
  if (!isRelayerConfigured()) {
    return NextResponse.json({ error: "relayer_unavailable" }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const stellarAddress = String(body.stellarAddress || "").toUpperCase()
  const sourceChainId = Number(body.sourceChainId)
  const amountUsdc = Number(body.amountUsdc)
  const fast = body.fast !== false
  const currentAllowanceRaw = String(body.currentAllowance ?? "0")

  if (!STELLAR_ADDRESS_RE.test(stellarAddress)) {
    return NextResponse.json({ error: "invalid_stellar_address" }, { status: 400 })
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc < CCTP_MIN_TRANSFER_USD) {
    return NextResponse.json(
      { error: "amount_too_small", minimumUsdc: CCTP_MIN_TRANSFER_USD },
      { status: 400 },
    )
  }
  let currentAllowance: bigint
  try {
    currentAllowance = BigInt(currentAllowanceRaw)
    if (currentAllowance < BigInt(0)) throw new Error("negative")
  } catch {
    return NextResponse.json({ error: "invalid_allowance" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, stellarAddress)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  // The gate. Fail-closed by construction: `checkCctpRecipient` answers
  // "unknown" when Horizon is unreachable, and unknown is not ready.
  const recipient = await checkCctpRecipient(stellarAddress)
  if (!recipient.ready) {
    return NextResponse.json(
      {
        error: "recipient_not_ready",
        recipient,
        message: describeCctpBlocker(recipient.blocker, recipient.reserveShortfallRaw),
      },
      { status: 409 },
    )
  }

  // Round to whole base units rather than truncating a fraction of a cent into
  // an amount the user did not choose. USDC is 6 decimals; anything finer than
  // that does not exist on the source chain.
  const amount = BigInt(Math.round(amountUsdc * Number(USDC_UNIT)))

  try {
    const plan = buildBurnPlan({ chainId: sourceChainId, amount, stellarAddress, currentAllowance, fast })
    // bigint does not survive JSON. Strings, decoded by the client back into
    // bigint before they reach viem — never numbers, which lose precision above
    // 2^53 and would silently misstate a large deposit.
    return NextResponse.json({
      plan: {
        ...plan,
        amount: plan.amount.toString(),
        maxFee: plan.maxFee.toString(),
      },
    })
  } catch (e) {
    // Every throw from `buildBurnPlan` is a refusal to build something
    // dangerous — an unsupported chain, an unknown USDC, a bad address. Its
    // message explains why, and the user is better served by it than by a
    // generic 500.
    return NextResponse.json(
      { error: "unbuildable", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }
}
