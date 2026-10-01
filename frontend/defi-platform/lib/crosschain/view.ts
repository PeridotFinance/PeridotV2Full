/**
 * A transfer as the browser sees it: the row minus what only the server needs
 * (the SODAX intent and relay payload, retry bookkeeping). Pure and
 * client-safe; the store type is imported for its shape only.
 */
import type { SodaxTransfer, SodaxTransferStatus } from "@/lib/cctp/store"
import type { XcChain, XcDirection } from "@/lib/crosschain/route"

export interface XcTransfer {
  id: number
  direction: XcDirection
  status: SodaxTransferStatus
  stellarAddress: string
  evmAddress: string
  src: { chain: XcChain; token: string; symbol: string; decimals: number; amount: string; txHash: string | null }
  dst: { chain: XcChain; token: string; symbol: string; decimals: number }
  quotedOut: string
  minOut: string
  deliveredOut: string | null
  usdValue: number | null
  /** SODAX's pipeline step while relaying ("pending", "relaying", "posting_execution", …). */
  sodaxStatus: string | null
  fillTxHash: string | null
  intentCancelled: boolean | null
  failReason: string | null
  supplyTxHash: string | null
  deadlineAt: string | null
  createdAt: string
  updatedAt: string
}

function chainOf(raw: string): XcChain {
  return raw === "stellar" ? "stellar" : Number(raw)
}

export function toTransferView(row: SodaxTransfer): XcTransfer {
  return {
    id: Number(row.id),
    direction: row.direction,
    status: row.status,
    stellarAddress: row.stellar_address,
    evmAddress: row.evm_address,
    src: {
      chain: chainOf(row.src_chain),
      token: row.src_token,
      symbol: row.src_symbol,
      decimals: row.src_decimals,
      amount: row.src_amount,
      txHash: row.src_tx_hash,
    },
    dst: { chain: chainOf(row.dst_chain), token: row.dst_token, symbol: row.dst_symbol, decimals: row.dst_decimals },
    quotedOut: row.quoted_out,
    minOut: row.min_out,
    deliveredOut: row.delivered_out,
    usdValue: row.usd_value,
    sodaxStatus: row.sodax_status,
    fillTxHash: row.fill_tx_hash,
    intentCancelled: row.intent_cancelled,
    failReason: row.fail_reason,
    supplyTxHash: row.supply_tx_hash,
    deadlineAt: row.deadline_at ? new Date(row.deadline_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/** Still moving on its own: the tab may poll, the cron will. */
export function isInFlight(t: Pick<XcTransfer, "status">): boolean {
  return t.status === "submitted" || t.status === "relaying"
}

/** Nothing further will happen without the user. */
export function isSettled(t: Pick<XcTransfer, "status">): boolean {
  return !isInFlight(t) && t.status !== "created"
}
