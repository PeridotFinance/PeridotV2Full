"use client"

/**
 * use-stellar-margin-keeper — client control for the always-on TP/SL keeper.
 *
 * Arming hands the server the signatures it needs to close ONE position on the
 * user's behalf while they're offline. Nothing else: each signature authorizes one
 * exact call on one position id, is single-use (Soroban nonce), and expires.
 *
 * The V3 split close needs the user on two of its three legs:
 *
 *   prepare_close_position_v3(user, id)        args fixed → one entry
 *   swap_close_position_v3(user, id, min_out)  min_out is only accepted inside
 *                                              [oracle floor, pool output] — a ~2%
 *                                              window that slides with the price,
 *                                              so no single value survives to fire
 *                                              time → sign a LADDER of candidates
 *   finish_close_position_v3(id)               permissionless → nothing to sign
 *
 * The swap leg cannot be simulated at arm time: it only exists once a pending
 * close does. So the entries are BUILT BY HAND rather than lifted from a
 * simulation — which works because all of them turned out to be flat invocations
 * with no sub-invocations to reproduce. `authorizeEntry` then signs
 * each one through Privy `signRawHash`, the raw-hash primitive the embedded wallet
 * already exposes (StellarSignerBridge).
 *
 * Verified end-to-end on testnet by scripts/margin-probe-v3-presigned-close.mjs:
 * a keeper drove the whole close with pre-signed auth only, the position owner
 * offline throughout. (That probe still names the pre-upgrade legs; the shape of
 * the proof — hand-built flat entries, keeper-signed envelope — is unchanged.)
 *
 * History: this used to pre-sign `close_position_v2_repay_only`. That entry point
 * trapped on the V3 controller for every position from every source, so no arm
 * ever fired; the 2026-08-31 upgrade removed it outright. It
 * then pre-signed begin + withdraw as two separate legs, until the same upgrade
 * folded them into `prepare_close_position_v3`. Arms from both eras carry entries
 * for calls the keeper no longer makes, and are retired server-side with a
 * re-arm prompt rather than left to fail silently at fire time.
 */
import { useCallback, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSignRawHash } from "@privy-io/react-auth/extended-chains"
import { toast } from "sonner"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING } from "../config/stellarMarginConfig"
import { vaultGetExchangeRate, getPriceUsd } from "@/lib/stellar-margin"
import type { StellarMarginPosition } from "../types/stellarMargin"

/** How long (ledgers) the pre-signed close stays valid. ~5s/ledger ⇒ ~5–6 days. */
const VALID_LEDGER_WINDOW = 100_000

/**
 * The swap ladder: candidate `min_out` values as basis-point offsets from the
 * arm-time oracle floor.
 *
 * Spacing has to be finer than the accepted window is wide (~2%, measured), or a
 * fire could find no usable rung. Range has to cover how far the floor can drift
 * between arming and firing — the keeper fires near the trigger, so ±6% is ample,
 * and anything past it is a re-arm rather than a silent failure.
 */
const RUNG_BPS = [-600, -500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500, 600]

/** Fixed legs signed alongside the ladder: the one that starts the close, plus
 *  the cancel that puts the position back if the swap window collapses mid-close. */
const FIXED_LEGS = 2

export interface KeeperArmView {
  position_id: string
  side: "Long" | "Short"
  take_profit_usd: number | null
  stop_loss_usd: number | null
  valid_until_ledger: number
  status: string
  fired_kind: "tp" | "sl" | null
  fired_tx_hash: string | null
}

function toHex(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0")
  return s
}
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b

export function useStellarMarginKeeper() {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const { signRawHash } = useSignRawHash()
  const [isArming, setIsArming] = useState(false)
  /** 0…1 while the ladder is being signed — arming takes ~15 signatures. */
  const [armProgress, setArmProgress] = useState(0)

  /** Read the keeper's public key + this account's arms. */
  const fetchKeeperInfo = useCallback(async (): Promise<{ enabled: boolean; keeperPublicKey: string | null; arms: KeeperArmView[] } | null> => {
    if (!address) return null
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/margin/keeper?address=${address}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [address, getAccessToken])

  const armPosition = useCallback(
    async (
      position: StellarMarginPosition,
      triggers: { takeProfit: number | null; stopLoss: number | null },
    ): Promise<boolean> => {
      if (!address) {
        toast.error("Connect your wallet first.")
        return false
      }
      if (!(triggers.takeProfit && triggers.takeProfit > 0) && !(triggers.stopLoss && triggers.stopLoss > 0)) {
        toast.error("Set a take-profit or stop-loss first.")
        return false
      }
      // Longs only, and said out loud rather than discovered at fire time.
      //
      // The ladder below pre-signs `swap_close_position_v3`, which is long-only —
      // it panics at the top of the function for a Short (testnet 2026-08-11). So
      // arming a Short produced a full set of valid signatures for a call that can
      // never succeed: every rung would trap in turn and the keeper would give up
      // silently.
      //
      // The Short entrypoint can't be laddered the same way. It takes
      // `swap_amount_in` as well as `min_debt_out`, and the input that buys the
      // debt back has to be quoted against the debt AND the pool as they stand at
      // fire time — a second dimension whose values aren't known at arm time. That
      // needs a keeper-side quote, not more pre-signed rungs.
      if (position.side === "Short") {
        toast.error("Always-on isn’t available for short positions yet — close this one yourself when you want out.")
        return false
      }
      setIsArming(true)
      setArmProgress(0)
      try {
        const info = await fetchKeeperInfo()
        if (!info?.enabled || !info.keeperPublicKey) {
          toast.error("Always-on isn't available right now.")
          return false
        }

        const S = await import("@stellar/stellar-sdk")
        const rpc = new S.rpc.Server(CFG.network.rpcUrl)
        const PASS = CFG.network.networkPassphrase
        const CTRL = CFG.contracts.marginController

        const map = SIDE_MAPPING[position.side]
        const positionAsset = CFG.assets[map.positionAsset]
        const debtAsset = CFG.assets[map.debtAsset]

        // Arm-time oracle floor for closing THIS position — the ladder's centre.
        // It's the same expression the contract enforces at swap time; the rungs
        // spread around it because the price will have moved by then.
        const [rate, positionPrice, debtPrice] = await Promise.all([
          vaultGetExchangeRate(positionAsset.vault),
          getPriceUsd(positionAsset.token),
          getPriceUsd(debtAsset.token),
        ])
        if (!positionPrice || !debtPrice) {
          toast.error("Prices are unavailable right now — try again in a moment.")
          return false
        }
        const collateralUnderlying = (position.collateralPtokens * rate) / CFG.constants.EXCHANGE_SCALE
        if (collateralUnderlying <= BigInt(0)) {
          toast.error("This position has no collateral to close.")
          return false
        }
        const baseFloor = ceilDiv(
          collateralUnderlying * positionPrice.price * debtPrice.scale * (CFG.constants.EXCHANGE_SCALE - CFG.constants.MAX_SLIPPAGE_SCALED),
          positionPrice.scale * debtPrice.price * CFG.constants.EXCHANGE_SCALE,
        )

        const latest = await rpc.getLatestLedger()
        const validUntil = latest.sequence + VALID_LEDGER_WINDOW

        const addr = (a: string) => S.Address.fromString(a).toScVal()
        const u64 = (v: string | bigint) => S.nativeToScVal(String(v), { type: "u64" })
        const u128 = (v: string | bigint) => S.nativeToScVal(String(v), { type: "u128" })

        /** One flat, unsigned auth entry for a controller call. */
        const buildEntry = (fnName: string, args: unknown[]) =>
          new S.xdr.SorobanAuthorizationEntry({
            credentials: S.xdr.SorobanCredentials.sorobanCredentialsAddress(
              new S.xdr.SorobanAddressCredentials({
                address: S.Address.fromString(address).toScAddress(),
                // Any unused nonce works; Soroban records it when the entry is
                // consumed, so a random 48-bit value collides only theoretically.
                nonce: S.xdr.Int64.fromString(String(Math.floor(Math.random() * 2 ** 48))),
                signatureExpirationLedger: 0, // authorizeEntry sets this
                signature: S.xdr.ScVal.scvVoid(),
              }),
            ),
            rootInvocation: new S.xdr.SorobanAuthorizedInvocation({
              function: S.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
                new S.xdr.InvokeContractArgs({
                  contractAddress: S.Address.fromString(CTRL).toScAddress(),
                  functionName: fnName,
                  args: args as never[],
                }),
              ),
              subInvocations: [],
            }),
          })

        const rawHashSigner = async (preimage: { toXDR: () => Buffer }) => {
          const payloadHash = S.hash(preimage.toXDR()) // sha256(preimage)
          const { signature } = await signRawHash({
            address,
            chainType: "stellar",
            hash: `0x${toHex(payloadHash)}`,
          })
          // Raw 64-byte Ed25519 signature; authorizeEntry embeds it. Avoid our own
          // `Buffer` (not guaranteed in the browser) — mirror lib/stellar-signer.ts.
          return { publicKey: address, signature: hexToBytes(signature) }
        }

        const total = FIXED_LEGS + RUNG_BPS.length
        let done = 0
        const sign = async (entry: unknown) => {
          const signed = await S.authorizeEntry(entry as never, rawHashSigner as never, validUntil, PASS)
          done += 1
          setArmProgress(done / total)
          return signed.toXDR("base64")
        }

        const posId = u64(position.positionId)
        const prepareAuthEntry = await sign(buildEntry("prepare_close_position_v3", [addr(address), posId]))
        const cancelAuthEntry = await sign(buildEntry("cancel_close_position_v3", [addr(address), posId]))

        const swapRungs: Array<{ bp: number; minOut: string; entry: string }> = []
        for (const bp of RUNG_BPS) {
          const minOut = (baseFloor * BigInt(10_000 + bp)) / BigInt(10_000)
          swapRungs.push({
            bp,
            minOut: String(minOut),
            entry: await sign(buildEntry("swap_close_position_v3", [addr(address), posId, u128(minOut)])),
          })
        }

        const token = await getAccessToken()
        const res = await fetch("/api/margin/keeper", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            userAddress: address,
            positionId: String(position.positionId),
            side: position.side,
            debtToken: position.debtToken,
            takeProfitUsd: triggers.takeProfit ?? null,
            stopLossUsd: triggers.stopLoss ?? null,
            prepareAuthEntry,
            cancelAuthEntry,
            swapRungs,
            validUntilLedger: validUntil,
          }),
        })
        if (!res.ok) {
          toast.error("Couldn't enable always-on. Please try again.")
          return false
        }
        toast.success("Always-on enabled — we'll close this even if you're offline.")
        return true
      } catch (e) {
        // Signing is the step users cancel; say that plainly rather than dumping
        // an SDK error into a toast.
        const msg = e instanceof Error ? e.message : "Couldn't enable always-on."
        toast.error(/reject|denied|cancel/i.test(msg) ? "Always-on wasn't enabled — the signature was declined." : msg)
        return false
      } finally {
        setIsArming(false)
        setArmProgress(0)
      }
    },
    [address, fetchKeeperInfo, getAccessToken, signRawHash],
  )

  const disarmPosition = useCallback(
    async (positionId: string | bigint): Promise<boolean> => {
      if (!address) return false
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/margin/keeper?address=${address}&positionId=${positionId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) return false
        toast.success("Always-on turned off for this position.")
        return true
      } catch {
        return false
      }
    },
    [address, getAccessToken],
  )

  return { armPosition, disarmPosition, fetchKeeperInfo, isArming, armProgress }
}
