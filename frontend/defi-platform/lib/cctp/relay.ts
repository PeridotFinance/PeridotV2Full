/**
 * CCTP relay — the last leg of a deposit: submitting Circle's attested message
 * on Stellar so the USDC is actually minted.
 *
 * Redeeming a CCTP message is **permissionless**: the contract authenticates
 * Circle's attester signatures, not the submitter. We still do it server-side
 * with our own keypair for two user-facing reasons:
 *   (a) it saves a wallet pop-up in the middle of a transfer the user already
 *       paid for on the source chain, and
 *   (b) the recipient is frequently a brand-new Stellar account that holds no
 *       XLM at all — asking it to pay the Soroban fee would deadlock the very
 *       transfer that is supposed to fund it.
 *
 * WHICH CONTRACT, AND WHY (this is the part that must not be guessed):
 *
 * The burn's `mintRecipient` is Circle's **CctpForwarder**, not the user — a
 * `G…` account cannot be a CCTP recipient, so the end user's address travels in
 * `hook_data`. The matching entrypoint is therefore the forwarder's
 *
 *     mint_and_forward(message: Bytes, attestation: Bytes) -> void
 *
 * which internally calls `MessageTransmitter.receive_message`, receives the
 * mint and forwards the USDC to the address in the hook data. Calling
 * `receive_message` ourselves would mint to the forwarder and strand the funds
 * there — the same class of mistake as the margin short-close entrypoint bug.
 *
 * Verified against the **deployed** contracts (not docs alone): the wasm was
 * fetched from both networks with `stellar contract fetch` and its
 * `contractspecv0` section decoded. Mainnet forwarder
 * `CBZL2IH7…JDF5T` and testnet forwarder `CA66Q2WF…4T4VSZ` both expose exactly
 * `mint_and_forward(message: Bytes, attestation: Bytes) -> void`, with no
 * `caller: Address` argument — i.e. no `require_auth`, so the relayer is only
 * the fee payer and never an authorizer. The message transmitter
 * (`CACMENFF…VXAZV`) exposes `is_nonce_used(nonce: BytesN[32]) -> Bool` and
 * `receive_message(caller: Address, message: Bytes, attestation: Bytes) -> Bool`.
 *
 * DOUBLE SUBMISSION is the failure mode that matters. The API route and the
 * cron pass can reach the same message at the same time, and anyone in the
 * world may also relay it — CCTP is designed that way. A message that is
 * already redeemed is a *success*: the money arrived. Treating it as an error
 * would flip a completed transfer to "failed" in our own records, which is
 * strictly worse than being slow. Hence `alreadyUsed` rather than a throw, both
 * before we build anything and again after any simulation/submit failure.
 *
 * Node-only (server keypair). Never import from a client component.
 */

import { getStellarRpcServer } from "@/lib/stellar-rpc"
import { CCTP_CONTRACTS } from "@/config/cctp"
import { stellarSorobanMainnetContracts } from "@/config/contracts"

export interface RelayResult {
  txHash: string
  /** true, wenn die Nachricht bereits eingelöst war — kein Fehler, siehe oben. */
  alreadyUsed: boolean
}

/** Same preset switch the rest of the CCTP config uses. */
const IS_MAINNET_PRESET = (process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet").startsWith("mainnet")

/**
 * Network the relay submits to. It must follow the same preset as
 * `CCTP_CONTRACTS`, or we would address testnet contract IDs on mainnet RPC.
 * The env var names are the ones already used elsewhere in the app so a
 * deployment only ever configures one RPC per network.
 */
function stellarNetwork(): { rpcUrl: string; networkPassphrase: string } {
  if (IS_MAINNET_PRESET) {
    return {
      rpcUrl: stellarSorobanMainnetContracts.rpcUrl,
      networkPassphrase: stellarSorobanMainnetContracts.networkPassphrase,
    }
  }
  return {
    rpcUrl:
      process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL ||
      `https://stellar-testnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    networkPassphrase:
      process.env.NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE ||
      "Test SDF Network ; September 2015",
  }
}

/**
 * Deliberately NOT `STELLAR_FUNDER_SECRET`.
 *
 * The funder provisions embedded wallets; the relayer pays a fee on every
 * single deposit and is the account most likely to run dry or need rotating.
 * Sharing one secret would mean a drained relayer also stops new users from
 * getting a wallet at all, and rotating one key would silently rotate the other.
 */
const RELAYER_SECRET_ENV = "STELLAR_CCTP_RELAYER_SECRET"

/** Stellar secret seeds are `S` + 55 base32 chars. */
const SECRET_RE = /^S[A-Z2-7]{55}$/

function relayerSecret(): string | null {
  const raw = (process.env[RELAYER_SECRET_ENV] || "").trim()
  return SECRET_RE.test(raw) ? raw : null
}

/**
 * `true` when a relayer keypair is configured. Callers use this to keep the
 * whole server-relay path quiet in environments that have no key — a dev box or
 * a preview deploy should degrade to "user relays it themselves", not crash on
 * import or 500 on the first deposit.
 */
export function isRelayerConfigured(): boolean {
  return relayerSecret() !== null
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "")
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hex payload")
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * CCTP **V2** message header, per Circle's message format:
 *
 *   0   version                    u32
 *   4   sourceDomain               u32
 *   8   destinationDomain          u32
 *   12  nonce                      bytes32   ← what `is_nonce_used` wants
 *   44  sender                     bytes32
 *   76  recipient                  bytes32
 *   108 destinationCaller          bytes32
 *   140 minFinalityThreshold       u32
 *   144 finalityThresholdExecuted  u32
 *   148 messageBody                bytes…
 *
 * V1 had a u64 nonce at offset 12 and a 116-byte header — a V1 message would
 * therefore produce a meaningless 32-byte slice here. We only ever burn through
 * the V2 TokenMessenger, so the length check below is the guard: anything
 * shorter than the V2 header is rejected instead of silently mis-parsed.
 */
const MESSAGE_HEADER_BYTES = 148
const NONCE_OFFSET = 12
const NONCE_BYTES = 32

function extractNonce(message: Uint8Array): Uint8Array {
  if (message.length < MESSAGE_HEADER_BYTES) {
    throw new Error(
      `CCTP message too short (${message.length} bytes) — expected at least a ${MESSAGE_HEADER_BYTES}-byte V2 header`,
    )
  }
  return message.slice(NONCE_OFFSET, NONCE_OFFSET + NONCE_BYTES)
}

/**
 * `MessageTransmitter.is_nonce_used(nonce)` via simulation — a pure read, no
 * fee, no signature.
 *
 * Returns `null` when the RPC could not answer. That is deliberately distinct
 * from `false`: an unreachable RPC must not be read as "not yet redeemed" in a
 * way that turns a genuine double-submit into a hard error later. Callers treat
 * `null` as "unknown, carry on and let the chain decide".
 */
async function readNonceUsed(
  Sdk: typeof import("@stellar/stellar-sdk"),
  rpc: any,
  nonce: Uint8Array,
): Promise<boolean | null> {
  try {
    const dummy = new Sdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
    const transmitter = new Sdk.Contract(CCTP_CONTRACTS.stellar.messageTransmitter)
    const tx = new Sdk.TransactionBuilder(dummy, {
      fee: "10000",
      networkPassphrase: stellarNetwork().networkPassphrase,
    })
      .addOperation(transmitter.call("is_nonce_used", Sdk.xdr.ScVal.scvBytes(Buffer.from(nonce))))
      .setTimeout(120)
      .build()

    const sim = await rpc.simulateTransaction(tx)
    if (!Sdk.rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null
    const native = Sdk.scValToNative(sim.result.retval)
    return typeof native === "boolean" ? native : null
  } catch {
    return null
  }
}

/**
 * Readable text out of a failed simulation. Budget / `ExceededLimit` errors are
 * real on this path — `mint_and_forward` verifies attester signatures, mints and
 * then does a token transfer inside one invocation — so the raw diagnostics are
 * worth carrying through rather than flattening to "simulation failed".
 */
function simulationErrorText(sim: any): string {
  const parts: string[] = []
  if (typeof sim?.error === "string" && sim.error) parts.push(sim.error)
  try {
    const events = sim?.events
    if (Array.isArray(events) && events.length > 0) {
      const rendered = events
        .map((e: any) => (typeof e === "string" ? e : typeof e?.toXDR === "function" ? e.toXDR("base64") : ""))
        .filter(Boolean)
        .join(" | ")
      if (rendered) parts.push(rendered.slice(0, 600))
    }
  } catch {
    /* diagnostics are best-effort */
  }
  return parts.join(" — ") || "simulation failed without a reason"
}

function ledgerErrorText(result: any): string {
  try {
    const res = result?.resultXdr
    if (res && typeof res.toString === "function") {
      const s = res.toString()
      if (s && s !== "[object Object]") return s
    }
  } catch {
    /* ignore */
  }
  return "no result detail"
}

/**
 * Poll until the transaction is on-ledger. `NOT_FOUND` just means "not yet",
 * so it keeps polling; only SUCCESS, FAILED or the deadline end the loop.
 */
async function waitForTx(
  rpc: any,
  hash: string,
  { timeoutMs = 90_000, pollIntervalMs = 2000 }: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let result: any
    try {
      result = await rpc.getTransaction(hash)
    } catch {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      continue
    }
    if (result?.status === "SUCCESS") return
    if (result?.status === "FAILED") {
      throw new Error(`CCTP relay reverted on ledger (${hash}): ${ledgerErrorText(result)}`)
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  throw new Error(`CCTP relay not confirmed within ${Math.round(timeoutMs / 1000)}s (hash: ${hash})`)
}

/**
 * Submit an attested CCTP message on Stellar and mint the USDC.
 *
 * Resolves with `alreadyUsed: true` (and an empty `txHash` when we never had to
 * broadcast) if the message had already been redeemed — by our own other
 * process, or by any third party. That is the happy path, not an error.
 *
 * Throws only when the mint genuinely did not happen: no relayer configured,
 * malformed payload, a simulation failure that is not a replay, or a
 * transaction that failed on ledger.
 */
export async function relayToStellar(params: {
  message: string
  attestation: string
}): Promise<RelayResult> {
  const secret = relayerSecret()
  if (!secret) {
    throw new Error(
      `CCTP relayer is not configured — set ${RELAYER_SECRET_ENV} (check isRelayerConfigured() before calling)`,
    )
  }

  const messageBytes = hexToBytes(params.message)
  const attestationBytes = hexToBytes(params.attestation)
  const nonce = extractNonce(messageBytes)

  const Sdk = await import("@stellar/stellar-sdk")
  const { rpcUrl, networkPassphrase } = stellarNetwork()
  // Mainnet reads go through the fail-over wrapper (lib/stellar-rpc.ts); the
  // testnet preset keeps its single configured endpoint.
  const rpc = IS_MAINNET_PRESET ? getStellarRpcServer(Sdk) : new Sdk.rpc.Server(rpcUrl)

  // 1. Already redeemed? Cheapest possible check, and the one that keeps a
  //    concurrent cron pass from spending a fee on a no-op that would then
  //    fail simulation and look like a broken transfer.
  if ((await readNonceUsed(Sdk, rpc, nonce)) === true) {
    return { txHash: "", alreadyUsed: true }
  }

  const relayer = Sdk.Keypair.fromSecret(secret)

  const account = await rpc.getAccount(relayer.publicKey()).catch((e: unknown) => {
    throw new Error(
      `CCTP relayer account ${relayer.publicKey()} is not usable (unfunded or RPC down): ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  })

  const forwarder = new Sdk.Contract(CCTP_CONTRACTS.stellar.cctpForwarder)
  const tx = new Sdk.TransactionBuilder(account, {
    // Inclusion-fee headroom only; `assembleTransaction` adds the Soroban
    // resource fee from the simulation on top.
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(
      forwarder.call(
        "mint_and_forward",
        Sdk.xdr.ScVal.scvBytes(Buffer.from(messageBytes)),
        Sdk.xdr.ScVal.scvBytes(Buffer.from(attestationBytes)),
      ),
    )
    .setTimeout(180)
    .build()

  // 2. Simulate before spending anything. Simulation is also our second replay
  //    detector: a message redeemed between the check above and here fails here.
  const sim = await rpc.simulateTransaction(tx)
  if (!Sdk.rpc.Api.isSimulationSuccess(sim)) {
    if ((await readNonceUsed(Sdk, rpc, nonce)) === true) {
      return { txHash: "", alreadyUsed: true }
    }
    throw new Error(`CCTP relay simulation failed: ${simulationErrorText(sim)}`)
  }

  const prepared = Sdk.rpc.assembleTransaction(tx, sim).build()
  prepared.sign(relayer)

  // 3. Broadcast.
  const sent = await rpc.sendTransaction(prepared)
  if (sent.status === "ERROR") {
    if ((await readNonceUsed(Sdk, rpc, nonce)) === true) {
      return { txHash: "", alreadyUsed: true }
    }
    throw new Error(`CCTP relay rejected by RPC: ${ledgerErrorText(sent)}`)
  }
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new Error("CCTP relay: network is busy, retry shortly")
  }

  // 4. Confirm. A revert here is still worth a last replay check — the most
  //    likely cause of a *failed* mint_and_forward is that someone else's relay
  //    landed in an earlier ledger of the same second.
  try {
    await waitForTx(rpc, sent.hash)
  } catch (e) {
    if ((await readNonceUsed(Sdk, rpc, nonce)) === true) {
      return { txHash: sent.hash, alreadyUsed: true }
    }
    throw e
  }

  return { txHash: sent.hash, alreadyUsed: false }
}
