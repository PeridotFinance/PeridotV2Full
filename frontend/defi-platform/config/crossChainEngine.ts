/**
 * Is the cross-chain engine (SODAX rail) taking new transfers?
 *
 * Server- and client-safe, like `config/crossChainDeposit.ts`, and with the
 * same asymmetry: only the *start* of a transfer is gated. Reporting a sent
 * transaction, reading its status and the cron's pass keep working with the
 * flag off, because by then the money has left the wallet and only the relay
 * can finish the job. A kill switch that strands a transfer is not one.
 *
 * `CROSSCHAIN_PAUSED` is read at request time on the server, so pausing needs
 * an env edit and a `pm2 restart`, not a build.
 */
import { FEATURE_FLAGS } from "@/config/featureFlags"

export function isCrossChainEngineEnabled(): boolean {
  return Boolean(FEATURE_FLAGS.CROSS_CHAIN_EXPERT || FEATURE_FLAGS.SODAX_SPIKE)
}

export function crossChainNewTransfersAllowed(): boolean {
  const paused = (process.env.CROSSCHAIN_PAUSED ?? "").trim().toLowerCase()
  if (paused === "1" || paused === "true") return false
  return isCrossChainEngineEnabled()
}
