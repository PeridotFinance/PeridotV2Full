/**
 * Circle CCTP V2 — the EVM burn leg of a Stellar deposit, as pure payloads.
 *
 * This module builds calldata and nothing else. It never signs, never sends,
 * never reads a chain and knows no wallet: the caller hands in the current
 * allowance, gets back `{ to, data }` pairs and decides how they travel —
 * a Privy sponsored send from the browser, a wagmi `writeContract`, an API
 * route, or a throwaway script. Same split as `lib/biconomy/payload.ts` /
 * `supply-flow-builder.ts`, and for the same reason: the money-shaped logic
 * has to be testable without a signer.
 *
 * The middle and last leg live elsewhere — `lib/cctp/attestation.ts` polls
 * Circle's Iris service for the signature, and the relay submits it on Stellar.
 *
 * ── The one non-obvious thing about Stellar as a destination ──────────────
 *
 * A `G…` account CANNOT be the `mintRecipient`. CCTP mints to whoever the
 * recipient field names, and on Stellar that has to be Circle's `CctpForwarder`
 * contract (`C…`): a plain account may not even hold a USDC trustline yet,
 * which is the normal state for someone who has only ever held USDC on an EVM
 * chain. The forwarder redeems the message, takes the mint and then pays the
 * real user. So:
 *
 *   • `mintRecipient`     = CctpForwarder contract id, as bytes32
 *   • `destinationCaller` = the SAME forwarder — the forwarder is the only
 *                           party allowed to call `receive_message` for this
 *                           message, which is what makes the forwarding step
 *                           un-front-runnable
 *   • the user's `G…`     = travels inside `hookData`
 *
 * and the entrypoint is therefore `depositForBurnWithHook`, never the plain
 * `depositForBurn`.
 */

import { encodeFunctionData, toHex } from "viem"
import { StrKey } from "@stellar/stellar-sdk"

import {
  CCTP_CONTRACTS,
  CCTP_MIN_TRANSFER_USD,
  CCTP_USDC_ADDRESSES,
  STELLAR_CCTP_DOMAIN,
  chainIdToCctpDomain,
} from "@/config/cctp"

/* ────────────────────────────── ABIs ─────────────────────────────────────
 *
 * Signature verified twice, independently, on 2026-08-26:
 *   1. https://developers.circle.com/cctp/references/contract-interfaces
 *   2. the deployed source itself,
 *      github.com/circlefin/evm-cctp-contracts → src/v2/TokenMessengerV2.sol
 * Both give the identical parameter order. Nothing here is from memory —
 * this repo has already paid once for a contract signature written from
 * recall (see the margin short-close entrypoint incident).
 */

const TOKEN_MESSENGER_V2_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const

/** Standard ERC-20 approve; only the one method we need. */
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

/* ───────────────────────── Finality thresholds ───────────────────────────
 *
 * Source: developers.circle.com/cctp/references/technical-guide —
 * "Messages with a `minFinalityThreshold` of 1000 or lower are considered
 * Fast messages"; 2000 is attested at the *finalized* level by Iris.
 *
 * These are the only two values we ever send. Anything in between is legal
 * protocol-wise but means nothing to Circle's attester tiers, so exposing it
 * would only be a way to get a transfer into a state nobody can explain.
 */

/** Confirmed-level attestation — seconds, costs a fee. */
export const FINALITY_THRESHOLD_FAST = 1000

/** Finalized-level attestation — source-chain finality, free. */
export const FINALITY_THRESHOLD_STANDARD = 2000

/* ──────────────────────────────── Fees ───────────────────────────────────
 *
 * Source: developers.circle.com/cctp/concepts/fees. Fast Transfer fees are
 * charged in basis points of the burn amount and vary per SOURCE chain,
 * currently 1 bps (Ethereum, Solana) to 13 bps (Linea). Standard Transfers
 * are free on every chain — hence `maxFee: 0n` for standard, which is not a
 * "skip the fee" trick but the documented value.
 *
 * Circle recommends fetching the live fee from their API and adding a 10–20%
 * buffer. This module is deliberately synchronous and network-free (that is
 * the whole point of it being a payload builder), so it cannot fetch. Instead
 * it uses a static ceiling that sits well above the worst documented chain:
 *
 *   13 bps (Linea, the most expensive) × ~2 ≈ 25 bps
 *
 * `maxFee` is a CEILING, not a price: Circle's `feeExecuted` is capped by it
 * and the user pays only the actual fee. Overshooting therefore costs nothing
 * today and buys headroom for a fee change; undershooting is the expensive
 * mistake. On a $100 deposit this ceiling is 2.5 cents.
 *
 * !! WHY THE CEILING MATTERS — the likely support ticket !!
 * The docs describe two different outcomes for a too-low `maxFee` and we have
 * seen both referenced:
 *   • the fees page says the burn REVERTS on the source chain, nothing burned;
 *   • the Iris API exposes `delayReason: "insufficient_fee"` (already handled
 *     in `lib/cctp/attestation.ts`), i.e. the burn went through but no fast
 *     attester picked it up and the transfer silently falls back to standard
 *     finality — the user sees a spinner for minutes instead of seconds.
 * Whichever applies on a given domain, both failure modes are avoided by
 * erring high, so we err high. If a support case shows up with a transfer
 * stuck in `pending_confirmations`, `delayReason` is the first thing to read.
 *
 * If precision ever matters more than robustness, the right fix is a
 * `maxFee` override on `buildBurnPlan` fed by Circle's fee endpoint — the
 * parameter shape below is already prepared for it.
 */

/** Static Fast-Transfer ceiling, in basis points of the burn amount. */
export const FAST_MAX_FEE_BPS = BigInt(25)

/**
 * Absolute floor, in USDC base units (6 decimals) = $0.001.
 * Integer bps maths on a small deposit can round to zero, and a `maxFee` of 0
 * on a fast burn is indistinguishable from asking for a free fast transfer —
 * exactly the `insufficient_fee` case above.
 */
export const FAST_MAX_FEE_FLOOR = BigInt(1_000)

/**
 * `BigInt(n)` rather than `123n` throughout: this repo's tsconfig targets ES6,
 * where bigint literals are a type error. Same values, no new red squiggles.
 */

/** USDC has 6 decimals on every CCTP domain. */
const USDC_DECIMALS = 6
const USDC_UNIT = BigInt(1_000_000) // 10 ** USDC_DECIMALS

/* ─────────────────────────── Address encoding ────────────────────────────
 *
 * A Stellar StrKey is base32 with a type prefix and a CRC — `C…` for a
 * contract id, `G…` for an ed25519 account — wrapping exactly 32 bytes of
 * payload, which is precisely what an EVM `bytes32` holds. The decoding is
 * done by `StrKey` from `@stellar/stellar-sdk`; hand-rolling base32 here
 * would be a silent-corruption risk against real money for no gain.
 */

/**
 * A Stellar contract id (`C…`) as EVM `bytes32`. This is what `mintRecipient`
 * and `destinationCaller` are built from.
 */
export function stellarContractIdToBytes32(c: string): `0x${string}` {
  const trimmed = (c ?? "").trim().toUpperCase()
  if (!StrKey.isValidContract(trimmed)) {
    throw new Error(
      `CCTP: "${c}" is not a valid Stellar contract id (expected a C… StrKey).`,
    )
  }
  return toHex(StrKey.decodeContract(trimmed))
}

/**
 * A Stellar account (`G…`) as EVM `bytes32`.
 *
 * NOTE — this is NOT what goes into `hookData`. The `CctpForwarder` wants the
 * recipient as a UTF-8 StrKey *string*, prefix and all (see
 * `buildForwarderHookData`), because it must be able to tell a `G…` account
 * from a `C…` contract from an `M…` muxed address, and the raw 32 bytes drop
 * exactly that information. The function is exported because callers need the
 * padded form for comparisons and for decoding what Iris echoes back in
 * `mintRecipient` — not as a hook-data ingredient.
 */
export function stellarAddressToBytes32(g: string): `0x${string}` {
  const trimmed = (g ?? "").trim().toUpperCase()
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    throw new Error(
      `CCTP: "${g}" is not a valid Stellar address (expected a G… StrKey).`,
    )
  }
  return toHex(StrKey.decodeEd25519PublicKey(trimmed))
}

/**
 * `hookData` in the layout Circle's Stellar `CctpForwarder` parses.
 *
 * Source: developers.circle.com/cctp/references/stellar → "Hook format",
 * cross-checked against the TypeScript sample in the Stellar quickstart
 * (developers.circle.com/cctp/quickstarts/transfer-usdc-stellar-arc):
 *
 *   bytes  0..23  Magic — Circle-reserved, "use all zero bytes"
 *   bytes 24..27  uint32 version, currently 0
 *   bytes 28..31  uint32 L — byte length of forwardRecipient
 *   bytes 32..32+L  forwardRecipient as a UTF-8 StrKey (the literal
 *                   "GABC…" characters, 56 bytes for a G-address)
 *   bytes 32+L..    optional integrator payload — we send none
 *
 * The reserved head is currently zeros; it is written explicitly rather than
 * assumed so a future non-zero magic has one obvious place to land.
 */
export function buildForwarderHookData(stellarAddress: string): `0x${string}` {
  const recipient = (stellarAddress ?? "").trim().toUpperCase()
  if (!StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error(
      `CCTP: "${stellarAddress}" is not a valid Stellar address (expected a G… StrKey) — ` +
        `the deposit would mint into the forwarder with nowhere to go.`,
    )
  }

  // ASCII-only by construction: a StrKey is base32 (A–Z, 2–7).
  const recipientBytes = new TextEncoder().encode(recipient)

  const out = new Uint8Array(32 + recipientBytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(24, 0, false) // version = 0, big-endian
  view.setUint32(28, recipientBytes.length, false) // L, big-endian
  out.set(recipientBytes, 32)

  return toHex(out)
}

/* ───────────────────────────── The plan ──────────────────────────────────*/

export interface BurnPlan {
  chainId: number
  sourceDomain: number
  usdc: `0x${string}`
  tokenMessenger: `0x${string}`
  /** undefined when the existing allowance already covers the burn */
  approve?: { to: `0x${string}`; data: `0x${string}` }
  burn: { to: `0x${string}`; data: `0x${string}` }
  amount: bigint
  maxFee: bigint
  minFinalityThreshold: number
}

export interface BuildBurnPlanParams {
  chainId: number
  /** USDC in base units (6 decimals) */
  amount: bigint
  /** The user's destination address on Stellar, G… */
  stellarAddress: string
  /** The user's current allowance to the TokenMessenger */
  currentAllowance: bigint
  /** true = fast transfer (costs a fee, seconds); false = standard (free, waits for finality) */
  fast?: boolean
}

/**
 * Everything the caller has to sign to move `amount` USDC from an EVM chain
 * into the user's Stellar wallet — an optional approve, then the burn.
 *
 * Throws rather than returning a half-usable plan: every failure here is a
 * misconfiguration or a bad input, and a burn built on a guess destroys real
 * USDC into a domain nobody can mint it back on.
 */
export function buildBurnPlan(params: BuildBurnPlanParams): BurnPlan {
  const { chainId, amount, stellarAddress, currentAllowance, fast = true } = params

  // ── Source chain must be a real CCTP domain ────────────────────────────
  const sourceDomain = chainIdToCctpDomain(chainId)
  if (sourceDomain === undefined) {
    // BSC is the trap: it is our EVM hub, so it shows up in every other chain
    // list in this repo — but Circle has never issued native USDC on it and
    // there is no CCTP domain for it, at any number.
    const bscHint =
      chainId === 56 || chainId === 97
        ? " BNB Chain/BSC has no CCTP domain at all — Circle issues no native USDC there." +
          " A deposit from BSC has to go through the existing Biconomy/Squid path instead."
        : ""
    throw new Error(`CCTP: chain ${chainId} is not a CCTP source domain.${bscHint}`)
  }

  // ── …and we must know its NATIVE USDC ──────────────────────────────────
  const usdcRaw = CCTP_USDC_ADDRESSES[chainId]
  if (!usdcRaw) {
    throw new Error(
      `CCTP: no verified native USDC address for chain ${chainId}. ` +
        `CCTP burns Circle-issued USDC only — a bridged variant (USDC.e) reverts.`,
    )
  }
  const usdc = usdcRaw as `0x${string}`
  const tokenMessenger = CCTP_CONTRACTS.evm.tokenMessengerV2 as `0x${string}`

  // ── Amount sanity ──────────────────────────────────────────────────────
  if (amount <= BigInt(0)) {
    throw new Error("CCTP: amount must be greater than zero.")
  }
  const minAmount = BigInt(CCTP_MIN_TRANSFER_USD) * USDC_UNIT
  if (amount < minAmount) {
    throw new Error(
      `CCTP: amount ${formatUsdc(amount)} USDC is below the ${CCTP_MIN_TRANSFER_USD} USDC minimum — ` +
        `below that the transfer fee and source-chain gas eat too much of the deposit.`,
    )
  }

  // ── Recipient: forwarder on chain, user in the hook ────────────────────
  // Throws on an invalid G… before anything else is built.
  const hookData = buildForwarderHookData(stellarAddress)
  const forwarder = stellarContractIdToBytes32(CCTP_CONTRACTS.stellar.cctpForwarder)

  // `destinationCaller` is the same forwarder, not zero: it is what restricts
  // redemption of this message to the contract that will actually forward the
  // mint on to the user. Documented requirement, not a hardening choice.
  const mintRecipient = forwarder
  const destinationCaller = forwarder

  // ── Fee / finality tier ────────────────────────────────────────────────
  const minFinalityThreshold = fast ? FINALITY_THRESHOLD_FAST : FINALITY_THRESHOLD_STANDARD
  const maxFee = fast ? fastMaxFee(amount) : BigInt(0)

  const burnData = encodeFunctionData({
    abi: TOKEN_MESSENGER_V2_ABI,
    functionName: "depositForBurnWithHook",
    args: [
      amount,
      // Destination is always Stellar — same domain number on mainnet and
      // testnet, because Circle keys the domain to the chain, not the network.
      STELLAR_CCTP_DOMAIN,
      mintRecipient,
      usdc,
      destinationCaller,
      maxFee,
      minFinalityThreshold,
      hookData,
    ],
  })

  // ── Approve, only when it is actually missing ──────────────────────────
  //
  // Exact amount, not `type(uint256).max`. An infinite approve to the
  // TokenMessenger would leave a standing allowance on the user's real USDC
  // long after the deposit, for a contract they interact with maybe twice a
  // year — the gas saved on a repeat deposit is not worth carrying that. It
  // also keeps the plan honest: one approve belongs to one burn, so a stale
  // allowance can never quietly fund a burn the user did not just authorise.
  const approve =
    currentAllowance < amount
      ? {
          to: usdc,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [tokenMessenger, amount],
          }),
        }
      : undefined

  return {
    chainId,
    sourceDomain,
    usdc,
    tokenMessenger,
    approve,
    burn: { to: tokenMessenger, data: burnData },
    amount,
    maxFee,
    minFinalityThreshold,
  }
}

/** Fast-Transfer ceiling for an amount: bps of the burn, never below the floor. */
export function fastMaxFee(amount: bigint): bigint {
  const bps = (amount * FAST_MAX_FEE_BPS) / BigInt(10_000)
  return bps > FAST_MAX_FEE_FLOOR ? bps : FAST_MAX_FEE_FLOOR
}

/** Base units → a human string, for error messages only. */
function formatUsdc(amount: bigint): string {
  const whole = amount / USDC_UNIT
  const frac = (amount % USDC_UNIT).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : `${whole}`
}
