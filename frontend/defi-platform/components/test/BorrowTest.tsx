'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount, useSwitchChain, useReadContract } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getChainConfig, CHAIN_IDS } from '@/config/contracts';
import { getMarketsForChain, getAssetContractAddresses } from '@/data/market-data';
import { useBorrowTransaction } from '@/hooks/use-borrow-transaction';
import { useBorrowingPower } from '@/hooks/use-borrowing-power';
import { useAllMarketMemberships } from '@/hooks/use-market-membership';
import combinedAbi from '@/app/abis/combinedAbi.json';
import { erc20Abi } from 'viem';

// Test chains - focusing on hub chains where borrow is supported
const TEST_CHAINS = [
  { id: CHAIN_IDS.BSC_MAINNET, name: 'BSC Mainnet', isHub: true },
  { id: CHAIN_IDS.MONAD_MAINNET, name: 'Monad Mainnet', isHub: true },
  { id: CHAIN_IDS.BSC_TESTNET, name: 'BSC Testnet', isHub: true },
  { id: CHAIN_IDS.MONAD_TESTNET, name: 'Monad Testnet', isHub: true },
] as const;

export function BorrowTest() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [selectedChainId, setSelectedChainId] = useState<number>(CHAIN_IDS.BSC_MAINNET);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('usdt');
  const [borrowAmount, setBorrowAmount] = useState<string>('10');
  const [showDebug, setShowDebug] = useState<boolean>(true);

  // Get borrowing power and account liquidity
  const { 
    borrowingPower, 
    accountLiquidity, 
    isBorrowAmountSafe,
    getMaxBorrowAmount,
    refetch: refetchBorrowingPower 
  } = useBorrowingPower();

  // Get collateral markets
  const { assetsIn: collateralAssetAddresses } = useAllMarketMemberships();

  // Get available markets for selected chain
  const availableMarkets = useMemo(() => {
    return getMarketsForChain(selectedChainId);
  }, [selectedChainId]);

  // Get selected asset details
  const selectedAsset = useMemo(() => {
    return availableMarkets.find(m => m.id === selectedAssetId);
  }, [availableMarkets, selectedAssetId]);

  // Get contract addresses for selected asset
  const contractAddresses = useMemo(() => {
    if (!selectedAsset) return null;
    return getAssetContractAddresses(selectedAssetId, selectedChainId);
  }, [selectedAsset, selectedAssetId, selectedChainId]);

  // Get chain config
  const chainConfig = useMemo(() => {
    return getChainConfig(selectedChainId);
  }, [selectedChainId]);

  // Read wallet balance for underlying token
  const { data: walletBalance, refetch: refetchWalletBalance } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: {
      enabled: !!(address && contractAddresses?.underlyingAddress),
      refetchInterval: 60000,
    },
  } as any);

  // Read underlying token decimals
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: combinedAbi,
    functionName: 'decimals',
    args: [],
    chainId: selectedChainId,
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    },
  } as any);

  // Read pToken balance
  const { data: pTokenBalance, refetch: refetchPTokenBalance } = useReadContract({
    address: contractAddresses?.pTokenAddress as Address,
    abi: combinedAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: {
      enabled: !!(address && contractAddresses?.pTokenAddress),
      refetchInterval: 60000,
    },
  } as any);

  // Read total borrow balance
  const { data: borrowBalance, refetch: refetchBorrowBalance } = useReadContract({
    address: contractAddresses?.pTokenAddress as Address,
    abi: combinedAbi,
    functionName: 'borrowBalanceCurrent',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: {
      enabled: !!(address && contractAddresses?.pTokenAddress),
      refetchInterval: 60000,
    },
  } as any);

  // Borrow transaction hook
  const {
    executeBorrow,
    step,
    error: borrowError,
    isLoading,
    canBorrow,
    statusMessage,
    borrowHash,
    reset: resetBorrow,
  } = useBorrowTransaction({
    assetId: selectedAssetId,
    amount: borrowAmount,
    destinationChainId: selectedChainId,
    feeMode: 'native',
    onSuccess: () => {
      // Refresh balances after successful borrow
      setTimeout(() => {
        refetchWalletBalance();
        refetchPTokenBalance();
        refetchBorrowBalance();
        refetchBorrowingPower();
      }, 2000);
    },
  });

  // Auto-select first asset when chain changes
  useEffect(() => {
    if (availableMarkets.length > 0) {
      const firstMarket = availableMarkets[0];
      setSelectedAssetId(firstMarket.id);
    }
  }, [selectedChainId, availableMarkets]);

  // Handle chain switch
  const handleSwitchChain = async (newChainId: number) => {
    setSelectedChainId(newChainId);
    if (isConnected && chainId !== newChainId) {
      try {
        await switchChainAsync?.({ chainId: newChainId });
      } catch (err) {
        console.error('Failed to switch chain:', err);
      }
    }
  };

  // Handle borrow execution
  const handleBorrow = async () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    if (chainId !== selectedChainId) {
      alert(`Please switch to ${TEST_CHAINS.find(c => c.id === selectedChainId)?.name} to continue`);
      return;
    }
    if (!borrowAmount || parseFloat(borrowAmount) <= 0) {
      alert('Please enter a valid borrow amount');
      return;
    }
    
    await executeBorrow();
  };

  // Format balance display
  const formatBalance = (balance: bigint | undefined, decimals: number) => {
    if (balance === undefined) return '...';
    return parseFloat(formatUnits(balance, decimals)).toFixed(4);
  };

  // Check if amount is safe
  const isSafeAmount = useMemo(() => {
    if (!borrowAmount || parseFloat(borrowAmount) <= 0) return false;
    return isBorrowAmountSafe(selectedAssetId, parseFloat(borrowAmount));
  }, [borrowAmount, selectedAssetId, isBorrowAmountSafe]);

  const maxBorrowAmount = useMemo(() => {
    return getMaxBorrowAmount(selectedAssetId);
  }, [selectedAssetId, getMaxBorrowAmount]);

  const decimals = (underlyingDecimals as number) || selectedAsset?.decimals || 18;

  // Debug: Log borrowing power calculation details
  useEffect(() => {
    if (selectedAsset && borrowingPower.availableBorrowingPowerUSD > 0) {
      console.log('[Borrow Test Debug]', {
        selectedAsset: selectedAsset.symbol,
        selectedChain: selectedChainId,
        availableBorrowingPowerUSD: borrowingPower.availableBorrowingPowerUSD,
        totalCollateralUSD: borrowingPower.totalCollateralUSD,
        totalBorrowedUSD: borrowingPower.totalBorrowedUSD,
        assetPrice: selectedAsset.price,
        assetOraclePrice: selectedAsset.oraclePrice,
        maxBorrowAmount,
        borrowAmount,
        borrowAmountNum: parseFloat(borrowAmount),
        isSafeAmount,
        collateralAssets: borrowingPower.collateralAssets,
      });
    }
  }, [selectedAsset, borrowingPower, maxBorrowAmount, borrowAmount, isSafeAmount, selectedChainId]);

  return (
    <div className="space-y-6">
      {/* Wallet Status */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Status</CardTitle>
          <CardDescription>Current wallet connection and network</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Wallet Address</Label>
              <div className="font-mono text-sm mt-1">
                {isConnected && address ? (
                  <span className="text-green-600">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                ) : (
                  <span className="text-red-600">Not connected</span>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Current Chain</Label>
              <div className="font-mono text-sm mt-1">
                {chainId ? (
                  <span className={chainId === selectedChainId ? 'text-green-600' : 'text-yellow-600'}>
                    {TEST_CHAINS.find(c => c.id === chainId)?.name || `Chain ${chainId}`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Borrow Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Borrow Configuration</CardTitle>
          <CardDescription>Select chain, asset, and amount to borrow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chain Selection */}
          <div className="space-y-2">
            <Label>Target Chain</Label>
            <Select 
              value={selectedChainId.toString()} 
              onValueChange={(value) => handleSwitchChain(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEST_CHAINS.map((chain) => (
                  <SelectItem key={chain.id} value={chain.id.toString()}>
                    {chain.name} {chain.isHub ? '(Hub)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chainId !== selectedChainId && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please switch to {TEST_CHAINS.find(c => c.id === selectedChainId)?.name} in your wallet
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-2"
                    onClick={() => switchChainAsync?.({ chainId: selectedChainId })}
                  >
                    Switch Chain
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Asset Selection */}
          <div className="space-y-2">
            <Label>Asset to Borrow</Label>
            <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMarkets.map((market) => (
                  <SelectItem key={market.id} value={market.id}>
                    {market.symbol} - {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Borrow Amount</Label>
              {maxBorrowAmount > 0 && (
                <span className="text-sm text-muted-foreground">
                  Max: {maxBorrowAmount.toFixed(4)} {selectedAsset?.symbol}
                </span>
              )}
            </div>
            <Input
              type="number"
              value={borrowAmount}
              onChange={(e) => setBorrowAmount(e.target.value)}
              placeholder="Enter amount"
              step="0.01"
            />
            {borrowAmount && parseFloat(borrowAmount) > 0 && (
              <div className="text-sm">
                {isSafeAmount ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Amount is within borrowing capacity
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Amount exceeds borrowing capacity (max: {maxBorrowAmount.toFixed(4)})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Borrow Button */}
          <Button
            onClick={handleBorrow}
            disabled={!canBorrow || isLoading || !isConnected || chainId !== selectedChainId || !isSafeAmount}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {statusMessage || 'Processing...'}
              </>
            ) : (
              'Execute Borrow'
            )}
          </Button>

          {/* Transaction Status */}
          {step !== 'idle' && (
            <div className="space-y-2">
              {step === 'success' && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <div>Borrow successful!</div>
                    {borrowHash && (
                      <div className="text-xs font-mono mt-1">
                        Tx: {borrowHash.slice(0, 10)}...{borrowHash.slice(-8)}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {step === 'error' && borrowError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {borrowError}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="ml-2 mt-2"
                      onClick={resetBorrow}
                    >
                      Reset
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {statusMessage && step !== 'success' && step !== 'error' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{statusMessage}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balances & Borrowing Power */}
      <Card>
        <CardHeader>
          <CardTitle>Balances & Borrowing Power</CardTitle>
          <CardDescription>Current wallet balances and available borrowing capacity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Wallet Balance</Label>
              <div className="text-lg font-semibold mt-1">
                {formatBalance(walletBalance as bigint, decimals)} {selectedAsset?.symbol}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">pToken Balance</Label>
              <div className="text-lg font-semibold mt-1">
                {formatBalance(pTokenBalance as bigint, decimals)} p{selectedAsset?.symbol}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Current Borrows</Label>
              <div className="text-lg font-semibold mt-1">
                {formatBalance(borrowBalance as bigint, decimals)} {selectedAsset?.symbol}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Collateral Markets</Label>
              <div className="text-lg font-semibold mt-1">
                {collateralAssetAddresses?.length || 0}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Available Borrowing Power</Label>
              <div className="text-2xl font-bold text-green-600 mt-1">
                ${borrowingPower.availableBorrowingPowerUSD?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Total Collateral Value</Label>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                ${borrowingPower.totalCollateralUSD?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          {accountLiquidity && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="font-medium">Account Liquidity (Raw):</div>
              <div className="font-mono text-xs space-y-1">
                <div>Error: {(accountLiquidity as any)[0]?.toString() || '0'}</div>
                <div>Liquidity: {formatUnits((accountLiquidity as any)[1] || BigInt(0), 18)} USD</div>
                <div>Shortfall: {formatUnits((accountLiquidity as any)[2] || BigInt(0), 18)} USD</div>
              </div>
            </div>
          )}

          {/* Borrowing Power Calculation Breakdown */}
          {borrowingPower.collateralAssets.length > 0 && (
            <div className="space-y-2">
              <Separator />
              <Label className="font-semibold">Collateral Assets Breakdown</Label>
              {borrowingPower.collateralAssets.map((collateral) => (
                <div key={collateral.assetId} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-semibold text-blue-900">{collateral.symbol}</div>
                  <div className="font-mono text-xs space-y-0.5">
                    <div>Supplied: {collateral.suppliedBalance.toFixed(6)} {collateral.symbol}</div>
                    <div>Value: ${collateral.suppliedValueUSD.toFixed(2)}</div>
                    <div>Collateral Factor: {(collateral.collateralFactor * 100).toFixed(0)}%</div>
                    <div className="text-green-700 font-medium">Borrowing Power: ${collateral.borrowingPowerUSD.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Asset Price Debug */}
          {selectedAsset && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm space-y-1">
              <div className="font-medium text-yellow-900">Selected Asset Price Debug</div>
              <div className="font-mono text-xs space-y-0.5">
                <div>Asset: {selectedAsset.symbol}</div>
                <div>Configured Price: ${selectedAsset.price?.toFixed(6) || 'N/A'}</div>
                <div>Oracle Price: ${selectedAsset.oraclePrice?.toFixed(6) || 'N/A'}</div>
                <div>Decimals: {decimals}</div>
                <div className="text-green-700 font-medium">
                  Max Borrow: {maxBorrowAmount.toFixed(8)} {selectedAsset.symbol}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Calculation: ${borrowingPower.availableBorrowingPowerUSD.toFixed(6)} ÷ ${(selectedAsset.oraclePrice || selectedAsset.price || 0).toFixed(6)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Information */}
      {showDebug && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Debug Information</CardTitle>
                <CardDescription>Contract addresses and configuration details</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowDebug(false)}>
                Hide Debug
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Contract Addresses */}
            <div className="space-y-2">
              <Label className="font-semibold">Contract Addresses</Label>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">pToken:</span>{' '}
                  <span className="text-blue-600">{contractAddresses?.pTokenAddress || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Underlying:</span>{' '}
                  <span className="text-blue-600">{contractAddresses?.underlyingAddress || 'N/A'}</span>
                </div>
                {chainConfig && 'unitrollerProxy' in chainConfig && (
                  <div>
                    <span className="text-muted-foreground">Controller:</span>{' '}
                    <span className="text-blue-600">{chainConfig.unitrollerProxy}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Chain Configuration */}
            <div className="space-y-2">
              <Label className="font-semibold">Chain Configuration</Label>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Chain ID:</span> {selectedChainId}
                </div>
                <div>
                  <span className="text-muted-foreground">Chain Name:</span>{' '}
                  {chainConfig && 'chainNameReadable' in chainConfig ? chainConfig.chainNameReadable : 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">RPC URL:</span>{' '}
                  {chainConfig && 'rpcUrl' in chainConfig ? chainConfig.rpcUrl : 'N/A'}
                </div>
                <div>
                  <span className="text-muted-foreground">Explorer:</span>{' '}
                  {chainConfig && 'explorer' in chainConfig ? chainConfig.explorer : 'N/A'}
                </div>
              </div>
            </div>

            {/* Asset Configuration */}
            <div className="space-y-2">
              <Label className="font-semibold">Asset Configuration</Label>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Asset ID:</span> {selectedAssetId}
                </div>
                <div>
                  <span className="text-muted-foreground">Symbol:</span> {selectedAsset?.symbol}
                </div>
                <div>
                  <span className="text-muted-foreground">Name:</span> {selectedAsset?.name}
                </div>
                <div>
                  <span className="text-muted-foreground">Decimals:</span> {decimals}
                </div>
              </div>
            </div>

            {/* Borrow State */}
            <div className="space-y-2">
              <Label className="font-semibold">Borrow State</Label>
              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Can Borrow:</span>{' '}
                  <span className={canBorrow ? 'text-green-600' : 'text-red-600'}>
                    {canBorrow ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Step:</span> {step}
                </div>
                <div>
                  <span className="text-muted-foreground">Is Loading:</span> {isLoading ? 'Yes' : 'No'}
                </div>
                {borrowHash && (
                  <div>
                    <span className="text-muted-foreground">Tx Hash:</span>{' '}
                    <span className="text-blue-600">{borrowHash}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showDebug && (
        <Button variant="outline" onClick={() => setShowDebug(true)} className="w-full">
          Show Debug Information
        </Button>
      )}
    </div>
  );
}

