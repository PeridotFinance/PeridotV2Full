/**
 * Runtime Stellar signer registry.
 *
 * The Soroban lending functions in `lib/stellar-soroban-lending.ts` are plain
 * (non-React) modules, but the embedded-wallet signer needs Privy's
 * `useSignRawHash` React hook. This registry bridges the gap: the React layer
 * (`StellarSignerBridge`) registers an active signer keyed by its Stellar
 * address; the lending functions call `signStellarXdr()` and stay
 * signer-agnostic.
 *
 * Selection rule — embedded wins only for *its own* address:
 *   - A registered signer is used **only** when `opts.address` matches the
 *     address it was registered for. This keeps the external Stellar Wallets
 *     Kit working for a user who happens to also have an embedded wallet
 *     provisioned (we never try to raw-sign for a Freighter address, and never
 *     route an embedded address to the kit).
 *   - Otherwise we fall back to `kitSignTransaction` (Freighter / xBull / Albedo
 *     / Lobstr / WalletConnect / Ledger), i.e. the pre-existing behaviour.
 *
 * Gating: the only thing that ever calls `setStellarSigner` is the
 * flag-gated bridge, so with `WALLET_PRIVY_STELLAR_EMBEDDED` off the registry
 * stays empty and `signStellarXdr` is a transparent pass-through to the kit.
 */

export type StellarXdrSigner = (
  xdr: string,
  opts: { networkPassphrase: string; address: string },
) => Promise<{ signedTxXdr: string }>

interface RegisteredSigner {
  /** The G… address this signer can sign for. */
  address: string
  sign: StellarXdrSigner
}

let active: RegisteredSigner | null = null

/** Register (or clear, with `null`) the embedded Stellar signer. */
export function setStellarSigner(signer: RegisteredSigner | null): void {
  active = signer
}

/** Address the embedded signer is currently registered for, if any. */
export function getRegisteredStellarSignerAddress(): string | undefined {
  return active?.address
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "")
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  // `btoa` exists in browsers, Node ≥16, and the jsdom test env.
  return btoa(bin)
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0")
  return s
}

/**
 * Turn a prepared Soroban XDR into a fully-signed XDR using a detached raw-hash
 * signer (Privy `signRawHash`). Pure and React-free so it can be unit-tested.
 *
 * `signHash` receives the 0x-prefixed transaction hash and returns the 64-byte
 * Ed25519 signature as hex (with or without `0x`). `addSignature` rebuilds the
 * keypair from the G-address, verifies the signature against the tx hash, and
 * attaches the decorated signature — throwing on mismatch, which gives us a
 * local correctness gate before submit.
 */
export async function buildRawSignedXdr(
  xdr: string,
  networkPassphrase: string,
  address: string,
  signHash: (hashHex: `0x${string}`) => Promise<string>,
): Promise<string> {
  const Sdk = await import("@stellar/stellar-sdk")
  const tx = Sdk.TransactionBuilder.fromXDR(xdr, networkPassphrase)
  // `tx.hash()` is the signature payload — it already binds the network id.
  const hash = (tx as unknown as { hash: () => Uint8Array }).hash()
  const signatureHex = await signHash(`0x${bytesToHex(hash)}`)
  const base64Sig = bytesToBase64(hexToBytes(signatureHex))
  ;(tx as unknown as { addSignature: (pk: string, sig: string) => void }).addSignature(
    address,
    base64Sig,
  )
  return tx.toXDR()
}

/**
 * Sign a Soroban-prepared XDR. Returns the same `{ signedTxXdr }` shape as
 * `kitSignTransaction`, so submit paths are unaffected.
 */
export async function signStellarXdr(
  xdr: string,
  opts: { networkPassphrase: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  if (active && opts.address && active.address === opts.address) {
    return active.sign(xdr, { networkPassphrase: opts.networkPassphrase, address: opts.address })
  }
  const { kitSignTransaction } = await import("@/lib/stellar-wallet-kit")
  return kitSignTransaction(xdr, opts)
}
