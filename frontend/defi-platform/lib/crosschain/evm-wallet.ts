/**
 * Which EVM wallet a cross-chain transfer pays from, and what a failed silent
 * send is allowed to do next.
 *
 * Expert takes whatever wagmi is connected to: MetaMask, or the embedded wallet
 * of a social login. Easy cannot rely on that. On the Stellar-only host the
 * active wallet is a Stellar one, and a purchase by card lands in the embedded
 * EVM wallet whether or not wagmi happens to point at it. So the embedded
 * wallet is looked up from Privy's own list when wagmi has nothing.
 *
 * Pure on purpose: no React, no wagmi.
 */
import { isEmbeddedWalletClientType } from "@/lib/login-kind"

export interface WalletLike {
  address?: string
  walletClientType?: string
  /** Privy marks EVM wallets `ethereum`; older entries carry no type. */
  type?: string
}

export interface XcEvmWalletChoice {
  address: string
  /** Privy holds the key: it can sign without a prompt. */
  embedded: boolean
  /** wagmi is connected to this address, so its send path can be used. */
  viaWagmi: boolean
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function isEvmWallet(w: WalletLike): boolean {
  return EVM_ADDRESS_RE.test(w.address ?? "") && (w.type == null || w.type === "ethereum")
}

export function pickXcEvmWallet(
  wagmiAddress: string | undefined,
  wallets: readonly WalletLike[] | null | undefined,
): XcEvmWalletChoice | null {
  const list = (wallets ?? []).filter(isEvmWallet)
  const embeddedWallets = list.filter((w) => isEmbeddedWalletClientType(w.walletClientType))

  if (wagmiAddress && EVM_ADDRESS_RE.test(wagmiAddress)) {
    return {
      address: wagmiAddress,
      embedded: embeddedWallets.some((w) => same(w.address, wagmiAddress)),
      viaWagmi: true,
    }
  }
  const embedded = embeddedWallets[0]
  return embedded?.address ? { address: embedded.address, embedded: true, viaWagmi: false } : null
}

/**
 * After a silent send threw: may the same transaction be sent again, this time
 * with the wallet's own confirmation window?
 *
 * Only when nothing left the wallet. A second send of a transfer that did go
 * out would pay for it twice, so the answer comes from the account's pending
 * nonce, read before the attempt and again after it. A nonce that moved, or one
 * that could not be read, means no second attempt.
 */
export function mayRetryAfterSilentFailure(nonceBefore: number | null, nonceAfter: number | null): boolean {
  return nonceBefore != null && nonceAfter != null && nonceAfter === nonceBefore
}
