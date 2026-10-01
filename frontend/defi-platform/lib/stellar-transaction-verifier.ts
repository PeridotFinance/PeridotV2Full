/**
 * Server-side verification of Stellar Soroban transactions.
 *
 * Mirrors the contract of `verifyTransactionOnChain` in
 * `lib/transaction-verifier.ts` but for the Stellar mainnet RPC. Stellar
 * tx hashes are 64-char hex (lowercase), addresses are 56-char base32.
 *
 * The verification we do here is intentionally narrow:
 *   1. The tx exists on-chain and ledger-status is SUCCESS
 *   2. The source account matches the claimed wallet
 *   3. We extract the ledger sequence (used as `block_number` in the
 *      shared `verified_transactions` table)
 *
 * We do *not* re-derive `actionType`, `tokenSymbol`, `amount`, or
 * `usdValue` from the tx envelope. Those are passed by the client (each
 * Stellar lending hook knows what it just submitted), and the route that
 * calls us is rate-limited + Privy-auth gated. This matches the trust
 * model of `/api/leaderboard/verify-crosschain` which also accepts
 * client-provided action data after on-chain existence + ownership are
 * confirmed.
 */

import { stellarRpcFetch } from '@/lib/stellar-rpc'
import { stellarSorobanMainnetContracts } from '@/config/contracts'

export interface StellarVerificationResult {
  isValid: boolean
  reason?: string
  /** Soroban ledger sequence the tx was included in. Stored as `block_number`. */
  ledgerSeq?: number
  /** Source account on the tx envelope (may differ in case from the claimed wallet). */
  sourceAccount?: string
}

/** Stellar Base32 account-address regex (56 chars, starts with G). */
const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/
/** Soroban tx hash regex (64-char lowercase hex). */
const STELLAR_TX_HASH_REGEX = /^[a-f0-9]{64}$/

export function isValidStellarAccountAddress(addr: string): boolean {
  return STELLAR_ACCOUNT_REGEX.test(addr)
}

export function isValidStellarTxHash(hash: string): boolean {
  return STELLAR_TX_HASH_REGEX.test(hash.toLowerCase())
}

export async function verifyStellarTransactionOnChain(
  txHash: string,
  expectedWalletAddress: string,
): Promise<StellarVerificationResult> {
  if (!isValidStellarTxHash(txHash)) {
    return { isValid: false, reason: 'Invalid Stellar tx hash format' }
  }
  if (!isValidStellarAccountAddress(expectedWalletAddress)) {
    return { isValid: false, reason: 'Invalid Stellar wallet address format' }
  }

  const normalizedHash = txHash.toLowerCase()

  // Soroban RPC is not available in the lightweight stellar-sdk subset, so
  // we use the JSON-RPC contract directly. Retry briefly in case the tx is
  // still propagating (Soroban tx is typically queryable within ~5s but
  // Freighter occasionally returns the hash before the ledger closes).
  const maxAttempts = 5
  const delayMs = 2000
  let lastErr: string | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      // Fails over to the next endpoint on a capped or dead one; see lib/stellar-rpc.ts.
      const response = await stellarRpcFetch(
        {
          jsonrpc: '2.0',
          id: attempt + 1,
          method: 'getTransaction',
          params: { hash: normalizedHash },
        },
        // Don't let the verify endpoint hang on a slow RPC.
        { signal: AbortSignal.timeout(10_000) },
      )

      if (!response.ok) {
        lastErr = `RPC HTTP ${response.status}`
        await sleep(delayMs)
        continue
      }

      const json = (await response.json()) as {
        result?: {
          status?: string
          ledger?: number
          envelopeXdr?: string
          resultXdr?: string
        }
        error?: { message?: string; code?: number }
      }

      if (json.error) {
        lastErr = json.error.message || `RPC error ${json.error.code}`
        await sleep(delayMs)
        continue
      }

      const status = json.result?.status
      if (!status || status === 'NOT_FOUND') {
        lastErr = 'Transaction not yet visible on RPC'
        await sleep(delayMs)
        continue
      }
      if (status !== 'SUCCESS') {
        return {
          isValid: false,
          reason: `Stellar tx status: ${status}`,
        }
      }

      const ledgerSeq = Number(json.result?.ledger ?? 0)

      // Decode the envelope XDR to extract the source account. We only
      // need the source account muxedAccount → account ID, so use the
      // stellar-sdk lazy import (already a dependency of the lending lib).
      const envelopeXdr = json.result?.envelopeXdr
      if (!envelopeXdr) {
        return {
          isValid: false,
          reason: 'Stellar tx envelope missing — cannot verify source',
        }
      }

      const sourceAccount = await extractSourceAccount(envelopeXdr)
      if (!sourceAccount) {
        return {
          isValid: false,
          reason: 'Could not extract source account from tx envelope',
        }
      }

      // Stellar Base32 addresses are case-sensitive — compare exactly.
      if (sourceAccount !== expectedWalletAddress) {
        return {
          isValid: false,
          reason: `Source account ${sourceAccount.slice(0, 6)}… does not match claimed wallet`,
          sourceAccount,
        }
      }

      return {
        isValid: true,
        ledgerSeq,
        sourceAccount,
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'Unknown RPC error'
      await sleep(delayMs)
    }
  }

  return {
    isValid: false,
    reason: lastErr || 'Stellar RPC verification failed after retries',
  }
}

async function extractSourceAccount(envelopeXdrBase64: string): Promise<string | null> {
  try {
    const StellarSdk = await import('@stellar/stellar-sdk')
    const env = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdrBase64, 'base64')
    const switchName = env.switch().name

    // tx v0: source is a raw Ed25519 public key (32 bytes).
    if (switchName === 'envelopeTypeTxV0') {
      const ed25519 = env.v0().tx().sourceAccountEd25519()
      return StellarSdk.StrKey.encodeEd25519PublicKey(ed25519)
    }

    // Pick the MuxedAccount XDR for v1 / fee-bump.
    let muxed: any
    if (switchName === 'envelopeTypeTx') {
      muxed = env.v1().tx().sourceAccount()
    } else if (switchName === 'envelopeTypeTxFeeBump') {
      muxed = env.feeBump().tx().feeSource()
    } else {
      return null
    }

    // MuxedAccount → raw 32-byte ed25519 public key. Two variants:
    //   keyTypeEd25519        → muxed.ed25519() returns Buffer directly
    //   keyTypeMuxedEd25519   → muxed.med25519().ed25519() returns Buffer
    const muxedSwitch = muxed.switch().name
    let raw: Buffer | Uint8Array
    if (muxedSwitch === 'keyTypeEd25519') {
      raw = muxed.ed25519()
    } else if (muxedSwitch === 'keyTypeMuxedEd25519') {
      raw = muxed.med25519().ed25519()
    } else {
      return null
    }

    // StrKey expects a Buffer; the XDR codec sometimes returns a plain
    // Uint8Array. Coerce defensively so we work in both shapes.
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    return StellarSdk.StrKey.encodeEd25519PublicKey(buf)
  } catch (err) {
    console.warn('[stellar-verifier] envelope decode failed:', err)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
