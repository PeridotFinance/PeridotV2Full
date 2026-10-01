'use client'

/**
 * use-ensure-evm-chain
 *
 * Switches the connected EVM wallet to `chainId` in a way the Privy embedded
 * wallet actually honours.
 *
 * Why wagmi's `switchChain` alone is not enough (verified against
 * @privy-io/react-auth 3.28.0, 2026-09-26): the wagmi connector for the
 * embedded wallet is a plain `injected()` connector around one EIP-1193
 * provider instance. `wallet_switchEthereumChain` on that instance updates
 * the instance and emits `chainChanged`, so wagmi reports the new chain. But
 * when the same instance receives `eth_sendTransaction`, Privy resolves the
 * chain to sign on from its own wallet store: it creates a *fresh* provider
 * via `wallet.getEthereumProvider()` and asks it for `eth_chainId`, and that
 * store is only written by `wallet.switchChain()` on the object `useWallets()`
 * hands out. viem does not put `chainId` into the `eth_sendTransaction`
 * params, so nothing else overrides it. Result: wagmi says 4663, Privy signs
 * and shows the transaction on `defaultChain` (BNB Smart Chain).
 *
 * So this hook does both: wagmi for every connector, plus Privy's own switch
 * for the embedded wallet, and then waits until `useWallets()` reflects the
 * new chain (the store that the send path reads is rebuilt in the same
 * effect), so the next `sendTransaction` cannot race the state update.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useAccount, useConfig, useSwitchChain } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { useWallets } from '@privy-io/react-auth'
import { isEmbeddedWalletClientType } from '@/lib/login-kind'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_DEFAULT_RPC_URL } from '@/config/robinhood'

const PRIVY_EMBEDDED_CONNECTOR_ID = 'io.privy.wallet'

/**
 * The RPC an external wallet (MetaMask and the like) is given when it has to
 * add a chain first. Without it wagmi hands over `chain.rpcUrls.default`,
 * which is our keyed Alchemy endpoint: the user's wallet would keep it as its
 * RPC for good, spend our quota on everything it does there, and fail
 * outright once that key's origin allowlist rejects the extension.
 */
const WALLET_ADD_RPC: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  56: 'https://bsc-dataseed.bnbchain.org',
  137: 'https://polygon-rpc.com',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  [ROBINHOOD_CHAIN_ID]: ROBINHOOD_DEFAULT_RPC_URL,
}
const SYNC_TIMEOUT_MS = 4000
const SYNC_POLL_MS = 50

function chainIdOf(wallet: { chainId?: string }): number | undefined {
  const raw = wallet.chainId?.split(':')[1]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) ? n : undefined
}

export function useEnsureEvmChain() {
  const config = useConfig()
  const { address, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { wallets } = useWallets()

  // The send path reads Privy's store, and `wallets` is derived from that
  // store, so watching `wallets` is how we know the switch has landed.
  const walletsRef = useRef(wallets)
  useEffect(() => {
    walletsRef.current = wallets
  }, [wallets])

  const findEmbedded = useCallback(() => {
    if (!address) return undefined
    return walletsRef.current.find(
      (w) => isEmbeddedWalletClientType(w.walletClientType) && w.address.toLowerCase() === address.toLowerCase(),
    )
  }, [address])

  const ensureChain = useCallback(
    async (chainId: number): Promise<void> => {
      // Read live: a flow holds this callback across several awaits, and the
      // chain it saw when it started is not the chain the wallet is on now.
      if (getAccount(config).chainId !== chainId) {
        const rpc = WALLET_ADD_RPC[chainId]
        await switchChainAsync({ chainId, ...(rpc ? { addEthereumChainParameter: { rpcUrls: [rpc] } } : {}) })
      }

      const isEmbedded = connector?.id === PRIVY_EMBEDDED_CONNECTOR_ID
      const embedded = findEmbedded()
      if (!isEmbedded && !embedded) return
      if (!embedded) {
        throw new Error('The Privy wallet is connected but not listed yet. Try again in a moment.')
      }
      if (chainIdOf(embedded) === chainId) return

      await embedded.switchChain(chainId)

      const deadline = Date.now() + SYNC_TIMEOUT_MS
      while (Date.now() < deadline) {
        const now = findEmbedded()
        if (now && chainIdOf(now) === chainId) return
        await new Promise((r) => setTimeout(r, SYNC_POLL_MS))
      }
      throw new Error(`The wallet did not switch to chain ${chainId}.`)
    },
    [config, switchChainAsync, connector?.id, findEmbedded],
  )

  return { ensureChain }
}
