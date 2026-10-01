// @vitest-environment node
// stellar-base key generation needs Node's crypto; jsdom's randomness shim
// breaks Keypair.random(). The signer runs server/worker-side anyway.
import { describe, it, expect } from "vitest"
import * as Sdk from "@stellar/stellar-sdk"
import { buildRawSignedXdr } from "@/lib/stellar-signer"

/**
 * Validates the embedded-wallet signing mechanic end-to-end without Privy:
 * Privy `signRawHash` is modelled by a local Ed25519 keypair signing the tx
 * hash. We assert that `buildRawSignedXdr` attaches a signature that (a) is
 * accepted by stellar-sdk's `addSignature` (it verifies internally, throwing on
 * mismatch) and (b) verifies against the transaction hash + public key.
 */
function buildSamplePreparedXdr(kp: Sdk.Keypair, passphrase: string): string {
  const account = new Sdk.Account(kp.publicKey(), "123")
  const tx = new Sdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(
      Sdk.Operation.payment({
        destination: kp.publicKey(),
        asset: Sdk.Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(30)
    .build()
  return tx.toXDR()
}

describe("buildRawSignedXdr", () => {
  const passphrase = Sdk.Networks.PUBLIC

  it("attaches a valid decorated signature from a detached hex signature", async () => {
    const kp = Sdk.Keypair.random()
    const xdr = buildSamplePreparedXdr(kp, passphrase)

    // Model Privy's raw-sign: sign the supplied tx hash with the Ed25519 key,
    // return the 64-byte signature as 0x-prefixed hex.
    const signHash = async (hashHex: `0x${string}`) => {
      const hashBytes = Buffer.from(hashHex.slice(2), "hex")
      const sig = kp.sign(hashBytes)
      return `0x${Buffer.from(sig).toString("hex")}`
    }

    const signedXdr = await buildRawSignedXdr(xdr, passphrase, kp.publicKey(), signHash)

    const parsed = Sdk.TransactionBuilder.fromXDR(signedXdr, passphrase) as Sdk.Transaction
    expect(parsed.signatures.length).toBe(1)
    expect(kp.verify(parsed.hash(), parsed.signatures[0].signature())).toBe(true)
    // Hint must match the signer's public key (last 4 bytes).
    expect(parsed.signatures[0].hint()).toEqual(kp.signatureHint())
  })

  it("rejects a signature that doesn't match the tx hash", async () => {
    const kp = Sdk.Keypair.random()
    const wrongKp = Sdk.Keypair.random()
    const xdr = buildSamplePreparedXdr(kp, passphrase)

    // A signature from the wrong key — addSignature must throw.
    const signHash = async (hashHex: `0x${string}`) => {
      const hashBytes = Buffer.from(hashHex.slice(2), "hex")
      return `0x${Buffer.from(wrongKp.sign(hashBytes)).toString("hex")}`
    }

    await expect(
      buildRawSignedXdr(xdr, passphrase, kp.publicKey(), signHash),
    ).rejects.toThrow()
  })
})
