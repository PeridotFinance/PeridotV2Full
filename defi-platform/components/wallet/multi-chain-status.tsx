'use client'

import React, { useEffect, useState } from 'react'
import { useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react'
import { useAccount, useBalance } from 'wagmi'
import { useSolana } from '@/hooks/use-solana'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wallet, Coins } from 'lucide-react'

export function MultiChainStatus() {
  const { address, isConnected } = useAppKitAccount()
  const { caipNetwork } = useAppKitNetwork()
  
  // EVM connection
  const { isConnected: isEvmConnected, address: evmAddress } = useAccount()
  const { data: evmBalance } = useBalance({
    address: evmAddress,
    query: { enabled: isEvmConnected }
  })
  
  // Solana connection
  const { 
    isConnected: isSolanaConnected, 
    publicKey: solanaPublicKey,
    getBalance: getSolanaBalance,
    network: solanaNetwork
  } = useSolana()
  
  const [solanaBalance, setSolanaBalance] = useState<number | null>(null)

  // Fetch Solana balance
  useEffect(() => {
    if (isSolanaConnected && solanaPublicKey) {
      getSolanaBalance()
        .then(balance => setSolanaBalance(balance))
        .catch(error => {
          console.error('Error fetching Solana balance:', error)
          setSolanaBalance(null)
        })
    } else {
      setSolanaBalance(null)
    }
  }, [isSolanaConnected, solanaPublicKey, getSolanaBalance])

  if (!isConnected) {
    return null
  }

  const isEvmNetwork = caipNetwork?.id && typeof caipNetwork.id === 'string' && 
    (caipNetwork.id.includes('eip155') || caipNetwork.id.includes('ethereum') || caipNetwork.id.includes('arbitrum'))
  const isSolanaNetwork = caipNetwork?.id && typeof caipNetwork.id === 'string' && 
    caipNetwork.id.includes('solana')

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5" />
          Multi-Chain Wallet Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Network */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Active Network:</span>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {caipNetwork?.name || caipNetwork?.id || 'Unknown'}
          </Badge>
        </div>

        {/* EVM Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">EVM Chains:</span>
            <Badge variant={isEvmConnected ? "default" : "outline"}>
              {isEvmConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          {isEvmConnected && (
            <div className="ml-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Address: {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : 'N/A'}
              </p>
              {evmBalance && (
                <div className="flex items-center gap-1 text-xs">
                  <Coins className="h-3 w-3" />
                  <span>{parseFloat(evmBalance.formatted).toFixed(4)} {evmBalance.symbol}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Solana Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Solana:</span>
            <Badge variant={isSolanaConnected ? "default" : "outline"}>
              {isSolanaConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          {isSolanaConnected && solanaPublicKey && (
            <div className="ml-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Address: {solanaPublicKey.toString().slice(0, 6)}...{solanaPublicKey.toString().slice(-4)}
              </p>
              {solanaBalance !== null && (
                <div className="flex items-center gap-1 text-xs">
                  <Coins className="h-3 w-3" />
                  <span>{solanaBalance.toFixed(4)} SOL</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Network Indicator */}
        {isEvmNetwork && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-xs">Using EVM network</span>
          </div>
        )}
        
        {isSolanaNetwork && (
          <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-950 rounded-md">
            <div className="w-2 h-2 bg-purple-500 rounded-full" />
            <span className="text-xs">Using Solana network</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default MultiChainStatus 