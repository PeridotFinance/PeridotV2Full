"use client"

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { monadTestnetContracts } from '@/config/contracts'
import { formatUnits } from 'viem'
import peridottrollerAbi from '@/app/abis/peridottrollerABI.json'

export const PeridotClaimDebugger = () => {
  const { address, isConnected, chainId, chain } = useAccount()
  const { writeContract, isPending, isSuccess, isError, error, data: txHash } = useWriteContract()
  const [debugLog, setDebugLog] = useState<string[]>([])

  const addLog = (message: string) => {
    setDebugLog(prev => [...prev, `${new Date().toISOString()}: ${message}`])
  }

  // Check accrued rewards
  const { data: accruedRewards, isLoading: isLoadingRewards } = useReadContract({
    address: monadTestnetContracts.unitrollerProxy as `0x${string}`,
    abi: peridottrollerAbi,
    functionName: 'peridotAccrued',
    args: [address],
    query: {
      enabled: !!address && isConnected && chainId === 10143,
    },
  })

  // Test claim with simple signature: claimPeridot(address holder)
  const testClaimSimple = () => {
    addLog('Testing simple claim: claimPeridot(address holder)')
    addLog(`Comptroller: ${monadTestnetContracts.unitrollerProxy}`)
    addLog(`User: ${address}`)
    addLog(`Accrued: ${accruedRewards?.toString()}`)
    
    writeContract({
      address: monadTestnetContracts.unitrollerProxy as `0x${string}`,
      abi: peridottrollerAbi,
      functionName: 'claimPeridot',
      args: [address], // Use the simple claimPeridot(address holder) signature
      account: address!,
      chain: chain!,
    })
  }

  // Test claim with all pTokens
  const testClaimAll = () => {
    addLog('Testing claim with all pTokens')
    const allPTokens = Object.values(monadTestnetContracts.markets).map(
      market => market.pToken as `0x${string}`
    )
    
    addLog(`Claiming from ${allPTokens.length} pTokens: ${allPTokens.join(', ')}`)
    addLog(`Comptroller: ${monadTestnetContracts.unitrollerProxy}`)
    addLog(`User: ${address}`)
    addLog(`Accrued: ${accruedRewards?.toString()}`)
    
    writeContract({
      address: monadTestnetContracts.unitrollerProxy as `0x${string}`,
      abi: peridottrollerAbi,
      functionName: 'claimPeridot',
      args: [address, allPTokens], // Use claimPeridot(address holder, contract PToken[] pTokens) signature
      account: address!,
      chain: chain!,
    })
  }

  // Test with empty array (should fail gracefully)
  const testClaimEmpty = () => {
    addLog('Testing claim with empty array')
    
    writeContract({
      address: monadTestnetContracts.unitrollerProxy as `0x${string}`,
      abi: peridottrollerAbi,
      functionName: 'claimPeridot',
      args: [address, []], // Empty pToken array 
      account: address!,
      chain: chain!,
    })
  }

  const clearLog = () => setDebugLog([])

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PERIDOT Claim Debugger</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please connect your wallet to test claiming.</p>
        </CardContent>
      </Card>
    )
  }

  if (chainId !== 10143) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PERIDOT Claim Debugger</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please switch to Monad Testnet (Chain ID: 10143) to test claiming.</p>
          <p>Current Chain ID: {chainId}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PERIDOT Claim Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Current Status</h3>
          <div className="space-y-1 text-sm">
            <p><strong>Connected:</strong> {isConnected ? 'Yes' : 'No'}</p>
            <p><strong>Chain ID:</strong> {chainId}</p>
            <p><strong>Address:</strong> {address}</p>
            <p><strong>Comptroller:</strong> {monadTestnetContracts.unitrollerProxy}</p>
            <p><strong>Accrued Rewards:</strong> {
              isLoadingRewards 
                ? 'Loading...' 
                : accruedRewards 
                  ? `${formatUnits(accruedRewards as bigint, 18)} PERIDOT` 
                  : '0 PERIDOT'
            }</p>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Test Claiming</h3>
          <div className="space-y-2">
                         <Button 
               onClick={testClaimSimple} 
               disabled={isPending}
               className="w-full"
             >
               {isPending ? 'Testing...' : 'Test Simple Claim (address only)'}
             </Button>
            
            <Button 
              onClick={testClaimAll} 
              disabled={isPending}
              className="w-full"
            >
              {isPending ? 'Testing...' : 'Test Claim All pTokens'}
            </Button>
            
            <Button 
              onClick={testClaimEmpty} 
              disabled={isPending}
              variant="outline"
              className="w-full"
            >
              {isPending ? 'Testing...' : 'Test Claim Empty Array (Should Fail)'}
            </Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Transaction Status</h3>
          {isPending && <p className="text-blue-600">Transaction pending...</p>}
          {isSuccess && (
            <div className="text-green-600">
              <p>Transaction successful!</p>
              {txHash && <p className="text-xs break-all">TX: {txHash}</p>}
            </div>
          )}
          {isError && (
            <div className="text-red-600">
              <p>Transaction failed!</p>
              <p className="text-xs">{error?.message}</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Debug Log</h3>
          <div className="flex gap-2 mb-2">
            <Button onClick={clearLog} size="sm" variant="outline">
              Clear Log
            </Button>
          </div>
          <div className="bg-gray-100 p-3 rounded text-xs max-h-64 overflow-y-auto">
            {debugLog.length === 0 ? (
              <p className="text-gray-500">No logs yet. Click a test button to start.</p>
            ) : (
              debugLog.map((log, index) => (
                <div key={index} className="mb-1 font-mono">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Contract Info</h3>
          <div className="text-xs space-y-1">
            <p><strong>Available pTokens:</strong></p>
            {Object.entries(monadTestnetContracts.markets).map(([symbol, market]) => (
              <p key={symbol} className="ml-4">
                {symbol}: {market.pToken}
              </p>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 