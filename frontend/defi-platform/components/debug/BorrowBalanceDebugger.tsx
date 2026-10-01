"use client"

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBorrowBalance } from '@/hooks/use-borrow-balance'
import { useBorrowingPower } from '@/hooks/use-borrowing-power'
import { getMarketsForChain } from '@/data/market-data'

export const BorrowBalanceDebugger = () => {
  const { address, chainId } = useAccount()
  const [selectedAsset, setSelectedAsset] = useState<string>('')
  
  const markets = chainId ? getMarketsForChain(chainId) : []
  
  const { borrowingPower } = useBorrowingPower()
  
  const {
    formattedBalance: borrowBalance,
    hasBorrow,
    rawBorrowBalance,
    error,
    isLoading
  } = useBorrowBalance({
    assetId: selectedAsset,
  })

  if (!address) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>🔍 Borrow Balance Debugger</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please connect your wallet to use the debugger</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>🔍 Borrow Balance Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Borrowing Power */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <h3 className="font-semibold mb-2">Overall Borrowing Power</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Total Borrowed USD: <strong>${borrowingPower?.totalBorrowedUSD?.toFixed(2) || '0.00'}</strong></div>
            <div>Borrowed Assets Count: <strong>{borrowingPower?.borrowedAssetsCount || 0}</strong></div>
            <div>Available to Borrow: <strong>${borrowingPower?.availableBorrowingPowerUSD?.toFixed(2) || '0.00'}</strong></div>
            <div>Has Any Borrows: <strong>{(borrowingPower?.totalBorrowedUSD || 0) > 0 ? 'YES' : 'NO'}</strong></div>
          </div>
        </div>

        {/* Asset Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Select Asset to Check:</label>
          <select 
            value={selectedAsset} 
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full p-2 border rounded-md"
          >
            <option value="">-- Select an asset --</option>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.name} ({market.symbol})
              </option>
            ))}
          </select>
        </div>

        {/* Asset-Specific Borrow Balance */}
        {selectedAsset && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="font-semibold mb-2">Asset-Specific Borrow Balance</h3>
            <div className="space-y-2 text-sm">
              <div>Selected Asset: <strong>{selectedAsset}</strong></div>
              <div>Is Loading: <strong>{isLoading ? 'YES' : 'NO'}</strong></div>
              <div>Has Error: <strong>{error ? 'YES' : 'NO'}</strong></div>
              {error && (
                <div className="text-red-600">
                  Error: <code className="text-xs">{error.message}</code>
                </div>
              )}
              <div>Raw Borrow Balance: <strong>{rawBorrowBalance?.toString() || 'undefined'}</strong></div>
              <div>Formatted Balance: <strong>{borrowBalance}</strong></div>
              <div>Has Borrow (calculated): <strong>{hasBorrow ? 'YES' : 'NO'}</strong></div>
            </div>
          </div>
        )}

        {/* Explanation */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
          <h3 className="font-semibold mb-2">🧠 Understanding the Results</h3>
          <ul className="text-sm space-y-1">
            <li>• <strong>If totalBorrowedUSD = 0:</strong> User has no active borrows across all assets</li>
            <li>• <strong>If borrowBalanceOf reverts:</strong> User has never borrowed this specific asset</li>
            <li>• <strong>If borrowBalanceOf returns 0:</strong> User borrowed but fully repaid this asset</li>
            <li>• <strong>Only positive balances:</strong> Indicate active debt for that asset</li>
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button 
            onClick={() => {
              console.log('=== MANUAL DEBUG TRIGGER ===')
              console.log('Overall borrowing power:', borrowingPower)
              console.log('Selected asset borrow data:', {
                assetId: selectedAsset,
                formattedBalance: borrowBalance,
                hasBorrow,
                rawBalance: rawBorrowBalance?.toString(),
                error: error?.message,
              })
            }}
          >
            Log Debug Info
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 