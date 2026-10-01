/**
 * The user's own CCTP transfers.
 *
 *   GET    /api/cctp/transfers?address=G…   what is in flight / recently done
 *   POST   /api/cctp/transfers              open the file when a burn lands
 *   PATCH  /api/cctp/transfers              close it: supplied, or kept in wallet
 *
 * Every verb proves ownership of the Stellar address with `authorizeStellarAddress`
 * — the same gate as the margin journal, so a Freighter user with no Privy
 * account is served too. A transfer is a record of somebody's money moving; it
 * is not public.
 *
 * This route never moves money. It records what the client observed and what
 * the user decided; the mint itself lives in /api/cctp/advance and the cron.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { normalizeWalletAddress } from "@/lib/walletKeys"
import { chainIdToCctpDomain, isCctpSourceChain } from "@/config/cctp"
import { isCrossChainDepositEnabled } from "@/config/crossChainDeposit"
import { checkCctpRecipient } from "@/lib/cctp/trustline"
import {
  listForAddress,
  markDismissed,
  markSupplied,
  recordBurn,
} from "@/lib/cctp/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const TX_HASH_RE = /^(0x)?[a-fA-F0-9]{40,80}$/

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").toUpperCase()
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }
  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  const transfers = await listForAddress(address)

  // A transfer that has not minted yet is the only one whose fate the recipient
  // can still change, and the trustline is the one thing that can stop the mint
  // dead. Answering it here — live, per request — beats writing a blocker onto
  // the row: the moment the user opens the trustline the next poll clears by
  // itself, with no state to invalidate and nothing to go stale.
  //
  // Only paid for when it can matter. A list of finished transfers costs no
  // Horizon read at all.
  const pending = transfers.some((t) => t.status === "burned" || t.status === "attested")
  const recipient = pending ? await checkCctpRecipient(address) : null

  return NextResponse.json({ transfers, recipient })
}

export async function POST(req: NextRequest) {
  // Only the opening of a *new* file is gated. GET and PATCH stay open even with
  // the feature off, so a transfer that was already burned can still be watched
  // and closed out by its owner.
  if (!isCrossChainDepositEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const stellarAddress = String(body.stellarAddress || "").toUpperCase()
  const evmAddress = String(body.evmAddress || "")
  const sourceChainId = Number(body.sourceChainId)
  const burnTxHash = String(body.burnTxHash || "")
  const amountUsdc = Number(body.amountUsdc)

  if (!STELLAR_ADDRESS_RE.test(stellarAddress)) {
    return NextResponse.json({ error: "invalid_stellar_address" }, { status: 400 })
  }
  if (!EVM_ADDRESS_RE.test(evmAddress)) {
    return NextResponse.json({ error: "invalid_evm_address" }, { status: 400 })
  }
  if (!TX_HASH_RE.test(burnTxHash)) {
    return NextResponse.json({ error: "invalid_burn_tx_hash" }, { status: 400 })
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }
  // A chain with no Circle domain can never have produced this burn. Rejecting
  // it here keeps a typo (or a BSC deposit taking the wrong path) from creating
  // a row the relayer will chase forever.
  if (!isCctpSourceChain(sourceChainId)) {
    return NextResponse.json({ error: "unsupported_source_chain" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, stellarAddress)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  // Idempotent on the burn hash: a retry or a second tab gets the same row back.
  const transfer = await recordBurn({
    stellarAddress,
    evmAddress: normalizeWalletAddress(evmAddress),
    sourceDomain: chainIdToCctpDomain(sourceChainId)!,
    sourceChainId,
    amountUsdc,
    burnTxHash,
  })

  return NextResponse.json({ transfer })
}

/**
 * The two ways a transfer ends by the user's hand: they supplied it, or they
 * chose to keep the USDC in their wallet. Deliberately not something the cron
 * can do — see lib/cctp/process.ts.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const stellarAddress = String(body.stellarAddress || "").toUpperCase()
  const id = Number(body.id)
  const action = String(body.action || "")

  if (!STELLAR_ADDRESS_RE.test(stellarAddress) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const auth = await authorizeStellarAddress(req, stellarAddress)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  if (action === "dismissed") {
    const row = await markDismissed(id, stellarAddress)
    if (!row) return NextResponse.json({ error: "not_dismissable" }, { status: 409 })
    return NextResponse.json({ transfer: row })
  }

  if (action === "supplied") {
    const supplyTxHash = String(body.supplyTxHash || "")
    if (!supplyTxHash) return NextResponse.json({ error: "missing_supply_tx_hash" }, { status: 400 })
    const row = await markSupplied(id, supplyTxHash)
    // 409, not 500: the row was not in `minted`. Almost always a double-report
    // from a retried supply, which is not an error worth alarming anyone about.
    if (!row) return NextResponse.json({ error: "not_suppliable" }, { status: 409 })
    return NextResponse.json({ transfer: row })
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 })
}
