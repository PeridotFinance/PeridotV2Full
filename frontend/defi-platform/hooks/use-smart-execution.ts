"use client"

import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { useSendTransaction, useAccount } from "wagmi"
import { type Address, type Hex } from "viem"
import { useState, useCallback, useMemo, useEffect } from "react"
import { toast } from "sonner"

export interface TransactionCall {
  to: Address
  data?: Hex
  value?: bigint
  abi?: any
  functionName?: string
  args?: any[]
}

export interface ExecutionOptions {
  onSuccess?: (hash: Hex) => void
  onError?: (error: Error) => void
  onPending?: (hash: Hex) => void
  title?: string
  description?: string
  chainId?: number
}

/**
 * A unified hook to execute transactions across EOA and Smart Accounts.
 * Supports single and batched transactions.
 */
export function useSmartExecution() {
  const { walletType, isSmartAccountActive, address: activeWalletAddress } = useActiveWallet()
  const { chainId: activeChainId } = useAccount()
  const smartWalletsHook = useSmartWallets()
  const { client: defaultSmartWalletClient, getClientForChain } = smartWalletsHook
  const { sendTransactionAsync: sendEoaTx } = useSendTransaction()
  const [isPending, setIsPending] = useState(false)

  // Resolve the smart wallet client for the active chain using the available API
  const [currentSmartWallet, setCurrentSmartWallet] = useState<any>(null)

  useEffect(() => {
    async function resolveClient() {
      if (!isSmartAccountActive || !activeChainId) {
        setCurrentSmartWallet(null)
        return
      }

      console.log("[useSmartExecution] Resolving smart wallet client", {
        activeChainId,
        hasGetClientForChain: !!getClientForChain,
        hasDefaultClient: !!defaultSmartWalletClient
      })

      try {
        if (getClientForChain) {
          const client = await getClientForChain({ id: activeChainId })
          if (client) {
            console.log("[useSmartExecution] Resolved client via getClientForChain", {
              address: client.address,
              chainId: client.chainId
            })
            setCurrentSmartWallet(client)
            return
          }
        }
        
        // Fallback to default client
        if (defaultSmartWalletClient) {
          console.log("[useSmartExecution] Using default smart wallet client", {
            address: defaultSmartWalletClient.address,
            chainId: defaultSmartWalletClient.chainId
          })
          setCurrentSmartWallet(defaultSmartWalletClient)
        }
      } catch (err) {
        console.error("[useSmartExecution] Failed to resolve smart wallet client:", err)
      }
    }

    resolveClient()
  }, [isSmartAccountActive, activeChainId, getClientForChain, defaultSmartWalletClient])

  const execute = useCallback(async (
    calls: TransactionCall | TransactionCall[],
    options: ExecutionOptions = {}
  ) => {
    setIsPending(true)
    const isBatch = Array.isArray(calls)
    const firstCall = isBatch ? calls[0] : calls
    const targetChainId = options.chainId || activeChainId

    try {
      let hash: Hex

      console.log("[useSmartExecution] Executing transaction", {
        walletType,
        isSmartAccountActive,
        currentSmartWalletExists: !!currentSmartWallet,
        isBatch,
        targetChainId
      })

      if (isSmartAccountActive) {
        // Resolve the smart wallet client for the target chain.
        // Always call getClientForChain so we get the right chain client, even when
        // targetChainId differs from the currently active wallet chain.
        let clientToUse: any = currentSmartWallet || defaultSmartWalletClient
        if (targetChainId && getClientForChain) {
          try {
            const chainClient = await getClientForChain({ id: targetChainId })
            if (chainClient) clientToUse = chainClient
          } catch (chainErr) {
            console.warn("[useSmartExecution] getClientForChain failed, falling back:", chainErr)
          }
        }

        if (!clientToUse) {
          const errorMsg = "Smart wallet client not ready. Please wait a moment and try again."
          console.error("[useSmartExecution]", errorMsg)
          throw new Error(errorMsg)
        }

        console.log("[useSmartExecution] Smart Account path active", {
          walletType,
          isSmartAccountActive,
          activeWalletAddress,
          targetChainId,
          smartWalletAddress: clientToUse.address,
          smartWalletChainId: clientToUse.chainId,
        })

        // Smart Account Execution (Privy)
        // Privy sendTransaction supports both single call and batch calls array.
        // Strip undefined values — Privy validates params strictly.
        const buildCall = (c: TransactionCall) => {
          const call: { to: Address; data?: Hex; value?: bigint } = { to: c.to }
          if (c.data !== undefined) call.data = c.data
          if (c.value !== undefined) call.value = c.value
          return call
        }
        const params = isBatch
          ? { calls: (calls as TransactionCall[]).map(buildCall) }
          : buildCall(firstCall)

        console.log("[useSmartExecution] Sending via smart wallet client", {
          params,
          isBatch,
          targetChainId
        })

        // Privy's sendTransaction second arg only accepts { uiOptions }.
        // Do NOT pass chainId or paymasterContext here — the chain is set via
        // getClientForChain, and paymaster is configured in SmartWalletsProvider.
        try {
          hash = await clientToUse.sendTransaction(params as any)
          console.log("[useSmartExecution] Transaction successfully sent, hash:", hash)
        } catch (txErr: any) {
          console.error("[useSmartExecution] Error inside clientToUse.sendTransaction:", txErr)
          // Log more details if available
          if (txErr.details) console.error("[useSmartExecution] Error details:", txErr.details)
          if (txErr.shortMessage) console.error("[useSmartExecution] Short message:", txErr.shortMessage)
          throw txErr
        }
      } else {
        console.log("[useSmartExecution] EOA path active", {
          walletType,
          isSmartAccountActive,
          activeChainId
        })
        // EOA Execution (Wagmi)
        if (isBatch) {
          throw new Error("Batch transactions are only supported for Smart Accounts")
        }

        hash = await sendEoaTx({
          to: firstCall.to,
          data: firstCall.data,
          value: firstCall.value,
        })
      }

      options.onPending?.(hash)
      options.onSuccess?.(hash)
      return hash
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error("[useSmartExecution] Transaction failed:", err)
      
      if (!err.message.includes("user rejected") && !err.message.includes("User rejected")) {
        toast.error(options.title || "Transaction Failed", {
          description: err.message
        })
      }
      
      options.onError?.(err)
      throw err
    } finally {
      setIsPending(false)
    }
  }, [isSmartAccountActive, currentSmartWallet, defaultSmartWalletClient, activeChainId, sendEoaTx, activeWalletAddress, walletType])

  return {
    execute,
    isPending,
    walletType,
    address: activeWalletAddress,
    chainId: activeChainId
  }
}
