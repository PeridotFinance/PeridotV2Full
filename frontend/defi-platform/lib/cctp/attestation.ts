/**
 * Circle Iris attestation client — the middle leg of a CCTP deposit.
 *
 * A burn on the source chain is only half a transfer: Circle's attestation
 * service watches the burn, waits for the domain's finality threshold, and
 * signs a message that whoever submits it on the destination can redeem for
 * freshly minted USDC. Until that signature exists there is nothing to relay,
 * so this module is pure polling — it never touches a chain and never signs.
 *
 * Deliberately free of imports from `config/cctp.ts` and `lib/cctp/store.ts`:
 * it takes a domain and a tx hash and answers with what Circle knows. That
 * keeps it usable from the API route, the cron pass and a throwaway script
 * alike.
 */

const IRIS_MAINNET = "https://iris-api.circle.com"
const IRIS_SANDBOX = "https://iris-api-sandbox.circle.com"

/**
 * Sandbox vs. production is decided by the same preset that decides which
 * chains exist, not by a separate env var — a testnet build asking the mainnet
 * attestation service would silently never find its burn.
 */
export function irisBaseUrl(): string {
  const preset = process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet"
  return preset.startsWith("mainnet") ? IRIS_MAINNET : IRIS_SANDBOX
}

/**
 * Why a transfer is sitting in `pending_confirmations` longer than finality
 * would explain. `insufficient_fee` is the one we can actually cause: a Fast
 * Transfer whose `maxFee` was quoted too low never gets picked up and silently
 * degrades to standard finality. Worth surfacing rather than showing the user
 * a spinner that means nothing.
 */
export type AttestationDelayReason =
  | "insufficient_fee"
  | "amount_above_max"
  | "insufficient_allowance_available"

export interface AttestationResult {
  /** Hex-encoded message — the first argument to `receive_message`. */
  message: string
  /** Circle's signature over it, or null while still pending. */
  attestation: string | null
  eventNonce: string
  status: "complete" | "pending_confirmations"
  delayReason: AttestationDelayReason | null
  /** Amount actually minted after the Fast Transfer fee, in USDC base units. */
  amount?: string
  /** Recipient parsed out of the burn — on Stellar this is the forwarder. */
  mintRecipient?: string
  /** `hook_data` — on Stellar this carries the end user's `G…` address. */
  hookData?: string
}

/** Nothing found (yet) is not an error: the burn may not be indexed. */
export type AttestationLookup =
  | { found: false }
  | { found: true; result: AttestationResult }

/**
 * One lookup. Returns `{ found: false }` for a burn Iris has not indexed yet —
 * normal for the first few seconds — and throws only on transport/HTTP faults,
 * so callers can distinguish "keep waiting" from "something is wrong".
 */
export async function fetchAttestation(
  sourceDomain: number,
  burnTxHash: string,
  opts: { signal?: AbortSignal } = {},
): Promise<AttestationLookup> {
  const url = `${irisBaseUrl()}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTxHash)}`
  const res = await fetch(url, {
    signal: opts.signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  })

  // Iris answers 404 while the burn is still unindexed. That is a wait, not a
  // failure — treating it as one would fail every transfer in its first seconds.
  if (res.status === 404) return { found: false }
  if (!res.ok) {
    throw new Error(`iris ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`)
  }

  const body = (await res.json()) as {
    messages?: Array<{
      message?: string
      attestation?: string | null
      eventNonce?: string
      status?: string
      delayReason?: string | null
      decodedMessage?: {
        decodedMessageBody?: {
          amount?: string
          mintRecipient?: string
          hookData?: string
        }
      }
    }>
  }

  // A burn tx can carry several messages; ours is the first (we never batch).
  const msg = body?.messages?.[0]
  if (!msg?.message) return { found: false }

  // Circle returns the literal string "PENDING" in `attestation` while it is
  // still working. Passing that on-chain would be rejected as a bad signature,
  // so it is normalised away here rather than at every call site.
  const attestation =
    typeof msg.attestation === "string" && msg.attestation.startsWith("0x")
      ? msg.attestation
      : null

  const decoded = msg.decodedMessage?.decodedMessageBody

  return {
    found: true,
    result: {
      message: msg.message,
      attestation,
      eventNonce: msg.eventNonce ?? "",
      status: msg.status === "complete" ? "complete" : "pending_confirmations",
      delayReason: (msg.delayReason as AttestationDelayReason | null) ?? null,
      amount: decoded?.amount,
      mintRecipient: decoded?.mintRecipient,
      hookData: decoded?.hookData,
    },
  }
}

/** A transfer is relayable only once both halves are there. */
export function isRelayable(r: AttestationResult): boolean {
  return r.status === "complete" && !!r.attestation
}
