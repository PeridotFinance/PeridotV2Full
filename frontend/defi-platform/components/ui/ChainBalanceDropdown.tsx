import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChainAssetBalances } from '@/lib/useChainAssetBalances'
import { formatChainName } from '@/lib/multiChainBalanceUtils'

// Helper function to format balance values
const formatBalanceValue = (balance: any): string => {
  if (!balance) return '0.0000'

  // Try to use display values first
  if (balance.display_values?.eth) {
    return parseFloat(balance.display_values.eth).toFixed(4)
  }

  // Fallback to raw value calculation
  if (balance.raw_value && balance.raw_value_decimals) {
    const rawValue = BigInt(balance.raw_value)
    const decimals = balance.raw_value_decimals
    const divisor = BigInt(Math.pow(10, decimals))
    const wholePart = rawValue / divisor
    const fractionalPart = rawValue % divisor

    if (fractionalPart === BigInt(0)) {
      return wholePart.toString()
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
    const trimmedFractional = fractionalStr.replace(/0+$/, '')

    return `${wholePart}.${trimmedFractional}`
  }

  return '0.0000'
}


interface ChainBalanceDropdownProps {
  walletId: string | null
  chainId: number
  chainName: string
  nativeBalance: string
  nativeSymbol: string
}

export function ChainBalanceDropdown({
  walletId,
  chainId,
  chainName,
  nativeBalance,
  nativeSymbol
}: ChainBalanceDropdownProps) {
  const { isExpanded, expand, collapse, balances, loading, error } = useChainAssetBalances(walletId, chainId)
  
  // Format the chain name for display
  const displayChainName = formatChainName(chainName, chainId)

  return (
    <div className="space-y-1">
      {/* Native token row - always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={isExpanded ? collapse : expand}
            className="h-4 w-4 p-0 hover:bg-transparent"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
          <span className="text-xs font-medium">{displayChainName}:</span>
        </div>
        <span className="text-xs">
          {nativeBalance} {nativeSymbol}
        </span>
      </div>
      
      {/* Expanded assets */}
      {isExpanded && (
        <div className="ml-6 space-y-1">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading assets...</span>
            </div>
          ) : error ? (
            <div className="text-xs text-red-500">Failed to load assets</div>
          ) : balances.length > 0 ? (
            balances.map((balance, index) => (
              <div key={index} className="flex justify-between text-xs text-muted-foreground">
                <span className="capitalize">{balance.asset}:</span>
                <span>{formatBalanceValue(balance)}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">No additional assets found</div>
          )}
        </div>
      )}
    </div>
  )
}
