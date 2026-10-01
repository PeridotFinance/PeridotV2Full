'use client';

/**
 * Reusable component for testing Biconomy cross-chain supply flow
 * Uses toMultichainNexusAccount and Fusion mode for external EOA wallets
 * Easily extensible for Privy smart embedded wallets
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { bsc, arbitrum, base, optimism, polygon, mainnet, avalanche } from 'viem/chains';
import { getMeeScanLink } from '@biconomy/abstractjs';
import { useBiconomyOrchestrator } from '@/hooks/use-biconomy-orchestrator';
import { useBiconomyTransactionStatus } from '@/hooks/use-biconomy-transaction-status';
import { PERIDOT_MARKETS, TOKENS, getUnderlyingToken } from '@/biconomy/constants';
import { CHAIN_BY_ID } from '@/lib/biconomy/wallet';
import { parseBiconomyError, formatErrorForDisplay, type BiconomyError } from '@/lib/biconomy/error-handler';
import { extractFeeFromQuote, formatFeeForDisplay, formatFeeBreakdown, type FeeInfo } from '@/lib/biconomy/fee-utils';
import { TransactionDetails } from './TransactionDetails';
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
import { Loader2, TestTube2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface SupplyTestConfig {
  sourceChainId: number;
  sourceToken: Address;
  supplyMarket: Address;
  amount: string;
  enableAsCollateral: boolean;
  returnPTokens: boolean;
  slippage: number;
}

// Chain configuration mapping
// Note: TOKENS uses 'mainnet' key for Ethereum mainnet
const CHAIN_CONFIG = {
  [arbitrum.id]: { chain: arbitrum, key: 'arbitrum' as const, label: 'Arbitrum One' },
  [base.id]: { chain: base, key: 'base' as const, label: 'Base' },
  [optimism.id]: { chain: optimism, key: 'optimism' as const, label: 'Optimism' },
  [polygon.id]: { chain: polygon, key: 'polygon' as const, label: 'Polygon' },
  [mainnet.id]: { chain: mainnet, key: 'mainnet' as const, label: 'Ethereum Mainnet' },
  [avalanche.id]: { chain: avalanche, key: 'avalanche' as const, label: 'Avalanche' },
} as const;

// Get available chains (excluding BSC as source since supply is on BSC)
const AVAILABLE_SOURCE_CHAINS = Object.values(CHAIN_CONFIG).filter(
  (config) => config.chain.id !== (bsc.id as number)
);

// Supply market options
const SUPPLY_MARKET_OPTIONS = [
  { value: PERIDOT_MARKETS.USDT, label: 'pUSDT', symbol: 'USDT' },
  { value: PERIDOT_MARKETS.USDC, label: 'pUSDC', symbol: 'USDC' },
  { value: PERIDOT_MARKETS.WETH, label: 'pWETH', symbol: 'WETH' },
  { value: PERIDOT_MARKETS.WBNB, label: 'pWBNB', symbol: 'WBNB' },
  { value: PERIDOT_MARKETS.WBTC, label: 'pWBTC', symbol: 'WBTC' },
] as const;

const DEFAULT_CONFIG: SupplyTestConfig = {
  sourceChainId: arbitrum.id,
  sourceToken: TOKENS.arbitrum.USDT as Address,
  supplyMarket: PERIDOT_MARKETS.USDT,
  amount: '10',
  enableAsCollateral: true,
  returnPTokens: true,
  slippage: 0.01,
};

export function BiconomySupplyTest() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const {
    orchestrator,
    meeClient,
    isInitializing,
    error: orchestratorError,
    initialize,
    reset,
    getOrchestratorAddress,
  } = useBiconomyOrchestrator();

  const [config, setConfig] = useState<SupplyTestConfig>(DEFAULT_CONFIG);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [parsedError, setParsedError] = useState<BiconomyError | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<`0x${string}` | null>(null);
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);
  const [quoteReceived, setQuoteReceived] = useState(false);
  
  // Test states
  const [testFeeResult, setTestFeeResult] = useState<string | null>(null);
  const [testStatusResult, setTestStatusResult] = useState<string | null>(null);
  const [testHash, setTestHash] = useState<string>('');

  // Monitor transaction status
  const {
    status: txStatus,
    receipt,
    parsedResponse,
    isLoading: isStatusLoading,
    refresh: refreshStatus,
  } = useBiconomyTransactionStatus({
    hash: transactionHash,
    meeClient,
    enabled: !!transactionHash,
    pollInterval: 5000,
    onStatusChange: (status) => {
      if (status === 'success') {
        setExecutionStatus('Transaction completed successfully!');
      } else if (status === 'failed') {
        setExecutionStatus('Transaction failed');
      } else if (status === 'mining') {
        setExecutionStatus('Transaction mining...');
      } else if (status === 'pending') {
        setExecutionStatus('Transaction pending...');
      }
    },
  });

  // Get available tokens for selected chain
  const availableTokens = useMemo(() => {
    const chainConfig = CHAIN_CONFIG[config.sourceChainId];
    if (!chainConfig) return [];
    
    const chainTokens = TOKENS[chainConfig.key];
    if (!chainTokens) return [];

    return Object.entries(chainTokens).map(([symbol, address]) => ({
      symbol,
      address: address as Address,
      label: symbol,
    }));
  }, [config.sourceChainId]);

  // Track previous chain ID to detect chain changes
  const prevChainIdRef = useRef<number>(config.sourceChainId);

  // Validate that selected token exists in available tokens
  const isValidToken = useMemo(() => {
    return availableTokens.some(
      (token) => token.address.toLowerCase() === config.sourceToken.toLowerCase()
    );
  }, [availableTokens, config.sourceToken]);

  // Auto-select first token when chain changes (not when token changes)
  useEffect(() => {
    // Only auto-select if chain actually changed
    if (prevChainIdRef.current !== config.sourceChainId && availableTokens.length > 0) {
      const firstToken = availableTokens[0];
      setConfig((prev) => ({ ...prev, sourceToken: firstToken.address }));
      prevChainIdRef.current = config.sourceChainId;
    }
  }, [config.sourceChainId, availableTokens]);

  // Auto-correct invalid token selection (only when availableTokens change, not when isValidToken changes)
  useEffect(() => {
    if (availableTokens.length > 0) {
      const isValid = availableTokens.some(
        (token) => token.address.toLowerCase() === config.sourceToken.toLowerCase()
      );
      if (!isValid) {
        const firstToken = availableTokens[0];
        setConfig((prev) => ({ ...prev, sourceToken: firstToken.address }));
      }
    }
  }, [availableTokens, config.sourceToken]);

  const handleInitialize = useCallback(async () => {
    await initialize();
  }, [initialize]);

  const handleExecuteSupply = useCallback(async () => {
    if (!orchestrator || !meeClient || !address) {
      setExecutionError('Orchestrator not initialized');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setParsedError(null);
    setExecutionStatus('Building instructions...');
    setFeeInfo(null);
    setQuoteReceived(false);

    try {
      // Get token decimals - assume 6 for USDC/USDT, 18 for others
      const selectedMarket = SUPPLY_MARKET_OPTIONS.find(m => m.value === config.supplyMarket);
      const tokenDecimals = selectedMarket?.symbol === 'WBTC' ? 8 : selectedMarket?.symbol === 'USDC' || selectedMarket?.symbol === 'USDT' ? 6 : 18;
      const supplyAmount = parseUnits(config.amount, tokenDecimals);
      
      // Get underlying token for the selected supply market
      const underlyingToken = getUnderlyingToken(config.supplyMarket);

      // Check if we need cross-chain swap
      const needsCrossChainSwap = config.sourceChainId !== bsc.id;
      
      if (needsCrossChainSwap) {
        // Use quote API with composeFlows for cross-chain flows
        setExecutionStatus('Building cross-chain flow with intent-simple...');
        
        // Build composeFlows array
        const composeFlows: any[] = [
          // Cross-chain swap
          {
            type: '/instructions/intent-simple',
            data: {
              srcChainId: config.sourceChainId,
              dstChainId: bsc.id,
              srcToken: config.sourceToken,
              dstToken: underlyingToken,
              amount: supplyAmount.toString(),
              slippage: config.slippage,
            },
          },
          // Approve
          {
            type: '/instructions/build',
            data: {
              functionSignature: 'function approve(address spender, uint256 amount)',
              args: [config.supplyMarket, { type: 'runtimeErc20Balance', tokenAddress: underlyingToken, constraints: { gte: '1' } }],
              to: underlyingToken,
              chainId: bsc.id,
              value: '0',
            },
          },
          // Mint
          {
            type: '/instructions/build',
            data: {
              functionSignature: 'function mint(uint256 mintAmount)',
              args: [{ type: 'runtimeErc20Balance', tokenAddress: underlyingToken, constraints: { gte: '1' } }],
              to: config.supplyMarket,
              chainId: bsc.id,
              value: '0',
            },
          },
        ];
        
        // Enter markets if enabled
        if (config.enableAsCollateral) {
          composeFlows.push({
            type: '/instructions/build',
            data: {
              functionSignature: 'function enterMarkets(address[] memory cTokens)',
              args: [[config.supplyMarket]],
              to: '0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14' as Address, // PERIDOT_CONTROLLER
              chainId: bsc.id,
              value: '0',
            },
          });
        }
        
        // Transfer pTokens back if enabled
        if (config.returnPTokens) {
          composeFlows.push({
            type: '/instructions/build',
            data: {
              functionSignature: 'function transfer(address to, uint256 value)',
              args: [address, { type: 'runtimeErc20Balance', tokenAddress: config.supplyMarket, constraints: { gte: '1' } }],
              to: config.supplyMarket,
              chainId: bsc.id,
              value: '0',
            },
          });
        }
        
        // Get quote from API
        setExecutionStatus('Requesting quote from API...');
        const quoteResponse = await fetch('/api/biconomy/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerAddress: address,
            mode: 'eoa',
            composeFlows,
            fundingTokens: [{
              tokenAddress: config.sourceToken,
              chainId: config.sourceChainId,
              amount: supplyAmount.toString(),
            }],
            feeToken: {
              address: config.sourceToken,
              chainId: config.sourceChainId,
            },
          }),
        });
        
        if (!quoteResponse.ok) {
          const errorText = await quoteResponse.text();
          let errorMessage = `Quote failed: ${errorText}`;
          
          // Try to parse the error response
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            // Use the text as-is if not JSON
          }
          
          const error = new Error(errorMessage);
          (error as any).response = errorText;
          throw error;
        }
        
        const quote = await quoteResponse.json();
        
        // Extract and store fee information
        const extractedFee = extractFeeFromQuote(quote);
        setFeeInfo(extractedFee);
        setQuoteReceived(true);
        
        // Step 2: Sign payloads
        if (!walletClient || !address) {
          throw new Error('Wallet client not available for signing');
        }
        
        const payloadToSign = quote.payloadToSign || [];
        if (!payloadToSign.length) {
          throw new Error('No payloads to sign in quote response');
        }
        
        setExecutionStatus(`Signing ${payloadToSign.length} payload(s)...`);
        const signedPayloads: any[] = [];
        
        for (const [index, pRaw] of payloadToSign.entries()) {
          // Handle different payload wrapper formats
          const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data;
          const hasSignableWrapper = pRaw && pRaw.signablePayload;
          const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw;
          const meta = hasSignableWrapper ? pRaw.metadata : undefined;
          
          if (!signable) {
            console.warn(`[BiconomySupplyTest] Empty signable payload at index ${index}`);
            signedPayloads.push(pRaw);
            continue;
          }
          
          // EIP-712 typed data (permit)
          if (signable.domain && signable.types && signable.message) {
            const primaryType = signable.primaryType || Object.keys(signable.types).find(k => k !== 'EIP712Domain') || 'Permit';
            setExecutionStatus(`Signing EIP-712 payload ${index + 1}/${payloadToSign.length}...`);
            
            try {
              const signature = await walletClient.signTypedData({
                account: address,
                domain: signable.domain,
                types: signable.types,
                primaryType,
                message: signable.message,
              } as any);
              
              signedPayloads.push(
                hasSignableWrapper
                  ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
                  : { message: signable.message, signature }
              );
              continue;
            } catch (permitError: any) {
              // Handle permit signing errors gracefully
              const errorMsg = permitError?.message || String(permitError);
              const isNoncesError = /nonces\(\)|does not implement nonces|EIP-2612/i.test(errorMsg);
              
              if (isNoncesError) {
                // Token doesn't support EIP-2612 permits - Biconomy will fall back to on-chain approve
                console.warn(`[BiconomySupplyTest] Permit signing failed (token doesn't support EIP-2612): ${errorMsg}`);
                console.warn(`[BiconomySupplyTest] Biconomy will automatically fall back to on-chain approve. Continuing...`);
                
                // Don't add this payload - Biconomy will handle the fallback
                // But we should still try to execute - Biconomy may have already prepared an on-chain fallback
                setExecutionStatus(`Permit not supported, using on-chain approve fallback...`);
                
                // Skip this payload - Biconomy will handle it server-side
                continue;
              } else {
                // Other permit errors - rethrow
                throw permitError;
              }
            }
          }
          
          // On-chain transaction
          if (signable.to && signable.data != null && signable.chainId) {
            const chain = CHAIN_BY_ID[signable.chainId];
            const valueBig = BigInt(signable.value || '0');
            setExecutionStatus(`Signing transaction ${index + 1}/${payloadToSign.length}...`);
            
            try {
              // Try signTransaction first
              const signature = await walletClient.signTransaction({
                account: address,
                chain,
                to: signable.to as Address,
                data: signable.data as `0x${string}`,
                value: valueBig,
              } as any);
              
              signedPayloads.push(
                hasSignableWrapper
                  ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
                  : { to: signable.to, data: signable.data, value: signable.value || '0', chainId: signable.chainId, signature }
              );
            } catch (signError: any) {
              // Fallback to sendTransaction if signTransaction is not supported
              if (signError?.message?.includes('eth_signTransaction') || signError?.message?.includes('Method not supported')) {
                setExecutionStatus(`Sending transaction ${index + 1}/${payloadToSign.length}...`);
                const txHash = await walletClient.sendTransaction({
                  account: address,
                  chain,
                  to: signable.to as Address,
                  data: signable.data as `0x${string}`,
                  value: valueBig,
                } as any);
                
                signedPayloads.push(
                  hasSignableWrapper
                    ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: txHash }
                    : { to: signable.to, data: signable.data, value: signable.value || '0', chainId: signable.chainId, signature: txHash }
                );
              } else {
                throw signError;
              }
            }
            continue;
          }
          
          // Simple message
          if (signable.message && typeof signable.message === 'string') {
            setExecutionStatus(`Signing message ${index + 1}/${payloadToSign.length}...`);
            const signature = await (walletClient as any).signMessage?.({ 
              account: address, 
              message: signable.message 
            });
            signedPayloads.push({ message: signable.message, signature });
            continue;
          }
          
          // Unknown format - forward as-is
          console.warn(`[BiconomySupplyTest] Unknown payload format at index ${index}`, signable);
          signedPayloads.push(pRaw);
        }
        
        // Step 3: Execute with signed payloads
        // Note: Even if some permit signatures failed, Biconomy may have prepared on-chain fallbacks
        setExecutionStatus('Executing transaction...');
        const executeResponse = await fetch('/api/biconomy/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerAddress: address,
            fee: quote.fee,
            quoteType: (quote.quoteType || quote.type || '').toString().toLowerCase(),
            quote: quote.quote || quote.result?.quote || quote,
            payloadToSign: signedPayloads,
          }),
        });
        
        let executeData: any;
        if (!executeResponse.ok) {
          const errorText = await executeResponse.text();
          let errorMessage = `Execute failed: ${errorText}`;
          
          // Try to parse the error response
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
            // Sometimes the error response might still contain useful data (like a hash)
            if (errorJson.hash || errorJson.transactionHash || errorJson.superTxHash) {
              executeData = errorJson;
            }
          } catch {
            // Use the text as-is if not JSON
          }
          
          // Check if it's a permit-related error that might still succeed
          const isPermitError = /nonces\(\)|permit|EIP-2612/i.test(errorMessage);
          if (isPermitError && executeData?.hash) {
            // Permit error but we got a hash - transaction might still succeed
            console.warn('[BiconomySupplyTest] Execute returned permit error but hash received. Transaction may still succeed.');
            setExecutionStatus('Transaction submitted (permit fallback in progress)...');
            // Continue to process the hash below
          } else if (isPermitError) {
            console.warn('[BiconomySupplyTest] Execute returned permit error, but transaction may still succeed. Check status.');
            // Don't throw - let the status monitoring handle it if we can get hash from elsewhere
            setExecutionStatus('Transaction submitted (permit fallback may be in progress)...');
            // Try to continue - Biconomy might have the transaction in flight
            throw new Error(`Permit signing failed, but transaction may still be processing. Please check the transaction status manually. Error: ${errorMessage}`);
          } else {
            const error = new Error(errorMessage);
            (error as any).response = errorText;
            throw error;
          }
        } else {
          executeData = await executeResponse.json();
        }
        
        // Extract transaction hash from response
        const hash = executeData?.hash || executeData?.transactionHash || executeData?.txHash || executeData?.superTxHash || executeData?.result?.hash;
        if (hash) {
          setTransactionHash(hash as `0x${string}`);
          setExecutionStatus('Transaction submitted successfully!');
          setExecutionError(null); // Clear any previous errors
          setParsedError(null);
        } else {
          // If no hash but response was OK, transaction might still be processing
          console.warn('[BiconomySupplyTest] Execute succeeded but no hash returned:', executeData);
          setExecutionStatus('Transaction submitted (awaiting hash confirmation)...');
          
          // Try to extract hash from nested structures
          const nestedHash = executeData?.result?.transactionHash || executeData?.data?.hash;
          if (nestedHash) {
            setTransactionHash(nestedHash as `0x${string}`);
          }
        }
      }

      // Same-chain flow using Fusion (no cross-chain swap needed)
      // Step 2: Build approve instruction
      setExecutionStatus('Building approve instruction...');
      const approveInstruction = await orchestrator.buildComposable({
        type: 'approve',
        data: {
          spender: config.supplyMarket,
          tokenAddress: underlyingToken,
          chainId: bsc.id,
          amount: supplyAmount, // Use fixed amount for now, runtime balance in production
        },
      });

      // Step 3: Build mint instruction
      setExecutionStatus('Building mint instruction...');
      const mintInstruction = await orchestrator.buildComposable({
        type: 'default',
        data: {
          chainId: bsc.id,
          abi: [
            {
              name: 'mint',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [{ name: 'mintAmount', type: 'uint256' }],
              outputs: [{ name: '', type: 'uint256' }],
            },
          ],
          to: config.supplyMarket,
          functionName: 'mint',
          args: [supplyAmount],
        },
      });

      // Step 4: Build enterMarkets instruction if enabled
      const instructions = [approveInstruction, mintInstruction];
      if (config.enableAsCollateral) {
        setExecutionStatus('Building enterMarkets instruction...');
        const enterMarketsInstruction = await orchestrator.buildComposable({
          type: 'default',
          data: {
            chainId: bsc.id,
            abi: [
              {
                name: 'enterMarkets',
                type: 'function',
                stateMutability: 'nonpayable',
                inputs: [{ name: 'cTokens', type: 'address[]' }],
                outputs: [{ name: '', type: 'uint256[]' }],
              },
            ],
            to: '0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14' as Address, // PERIDOT_CONTROLLER
            functionName: 'enterMarkets',
            args: [[config.supplyMarket]],
          },
        });
        instructions.push(enterMarketsInstruction);
      }

      // Step 5: Build transfer instruction to return pTokens to user
      if (config.returnPTokens) {
        setExecutionStatus('Building transfer instruction...');
        const transferInstruction = await orchestrator.buildComposable({
          type: 'default',
          data: {
            chainId: bsc.id,
            abi: [
              {
                name: 'transfer',
                type: 'function',
                stateMutability: 'nonpayable',
                inputs: [
                  { name: 'to', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
                outputs: [{ name: '', type: 'bool' }],
              },
            ],
            to: config.supplyMarket,
            functionName: 'transfer',
            args: [address, supplyAmount], // Simplified - use runtime balance in production
          },
        });
        instructions.push(transferInstruction);
      }

      // Step 6: Get Fusion quote (for external EOA wallets)
      setExecutionStatus('Requesting Fusion quote...');
      const fusionQuote = await meeClient.getFusionQuote({
        instructions,
        trigger: {
          chainId: config.sourceChainId,
          tokenAddress: config.sourceToken,
          amount: supplyAmount,
        },
        feeToken: {
          address: config.sourceToken,
          chainId: config.sourceChainId,
        },
      });
      
      // Extract and store fee information
      const extractedFee = extractFeeFromQuote(fusionQuote as any);
      setFeeInfo(extractedFee);
      setQuoteReceived(true);

      // Step 7: Execute
      setExecutionStatus('Executing transaction...');
      const { hash } = await meeClient.executeFusionQuote({ fusionQuote });
      setTransactionHash(hash as `0x${string}`);

      setExecutionStatus('Waiting for confirmation...');
      // Note: Status monitoring is handled by the useBiconomyTransactionStatus hook
      // We can optionally wait here, but the hook will update status automatically
      try {
        await meeClient.waitForSupertransactionReceipt({ hash });
        setExecutionStatus('Transaction completed successfully!');
      } catch (err) {
        // Hook will handle status updates even if wait fails
        console.warn('[BiconomySupplyTest] Wait for receipt failed, but hook will continue monitoring:', err);
      }
    } catch (err) {
      // Parse and format the error
      const biconomyError = parseBiconomyError(err);
      setParsedError(biconomyError);
      
      const errorDisplay = formatErrorForDisplay(biconomyError);
      setExecutionError(errorDisplay.message);
      setExecutionStatus(null);
      
      console.error('[BiconomySupplyTest] Execution failed:', {
        category: biconomyError.category,
        message: biconomyError.message,
        userMessage: biconomyError.userMessage,
        originalError: err,
      });
    } finally {
      setIsExecuting(false);
    }
  }, [orchestrator, meeClient, address, walletClient, config]);

  const bscOrchestratorAddress = orchestrator ? getOrchestratorAddress(bsc.id) : null;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Biconomy Cross-Chain Supply Test</CardTitle>
        <CardDescription>
          Test the cross-chain supply flow using toMultichainNexusAccount and Fusion mode
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Orchestrator Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Orchestrator Status</Label>
            {orchestrator && meeClient ? (
              <Button variant="outline" size="sm" onClick={reset}>
                Reset
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={handleInitialize} disabled={isInitializing || !address}>
                {isInitializing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  'Initialize Orchestrator'
                )}
              </Button>
            )}
          </div>
          {orchestrator && meeClient && (
            <Alert>
              <AlertDescription>
                <div className="space-y-1 text-sm">
                  <div>✅ Orchestrator initialized</div>
                  {bscOrchestratorAddress && (
                    <div className="font-mono text-xs">
                      BSC Address: {bscOrchestratorAddress}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {orchestratorError && (
            <Alert variant="destructive">
              <AlertDescription>{orchestratorError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sourceChain">Source Chain</Label>
            <Select
              value={String(config.sourceChainId)}
              onValueChange={(value) => {
                const chainId = Number(value);
                // Only update chain - token will be auto-selected by useEffect
                setConfig((prev) => ({
                  ...prev,
                  sourceChainId: chainId,
                }));
              }}
            >
              <SelectTrigger id="sourceChain">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_SOURCE_CHAINS.map((chainConfig) => (
                  <SelectItem key={chainConfig.chain.id} value={String(chainConfig.chain.id)}>
                    {chainConfig.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sourceToken">Source Token</Label>
            <Select
              value={config.sourceToken}
              onValueChange={(value) =>
                setConfig((prev) => ({ ...prev, sourceToken: value as Address }))
              }
            >
              <SelectTrigger id="sourceToken">
                <SelectValue placeholder="Select token" />
              </SelectTrigger>
              <SelectContent>
                {availableTokens.length === 0 ? (
                  <SelectItem value="" disabled>
                    No tokens available for this chain
                  </SelectItem>
                ) : (
                  availableTokens.map((token) => (
                    <SelectItem key={token.address} value={token.address}>
                      {token.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!isValidToken && availableTokens.length > 0 && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Selected token not available on this chain. Auto-selecting first available token...
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplyMarket">Supply Market (pToken)</Label>
            <Select
              value={config.supplyMarket}
              onValueChange={(value) =>
                setConfig({ ...config, supplyMarket: value as Address })
              }
            >
              <SelectTrigger id="supplyMarket">
                <SelectValue placeholder="Select market" />
              </SelectTrigger>
              <SelectContent>
                {SUPPLY_MARKET_OPTIONS.map((market) => (
                  <SelectItem key={market.value} value={market.value}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="text"
              value={config.amount}
              onChange={(e) => setConfig({ ...config, amount: e.target.value })}
              placeholder="10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slippage">Slippage (%)</Label>
            <Input
              id="slippage"
              type="number"
              step="0.1"
              value={config.slippage * 100}
              onChange={(e) =>
                setConfig({ ...config, slippage: Number(e.target.value) / 100 })
              }
              placeholder="1.0"
            />
          </div>
        </div>

        {/* Options */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.enableAsCollateral}
              onChange={(e) =>
                setConfig({ ...config, enableAsCollateral: e.target.checked })
              }
            />
            <span className="text-sm">Enable as Collateral</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.returnPTokens}
              onChange={(e) =>
                setConfig({ ...config, returnPTokens: e.target.checked })
              }
            />
            <span className="text-sm">Return pTokens to User</span>
          </label>
        </div>

        {/* Fee Information */}
        {feeInfo && quoteReceived && !isExecuting && (
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Transaction Fee</div>
                <div className="text-lg font-mono">
                  {formatFeeForDisplay(feeInfo)}
                </div>
                {feeInfo.isSponsored && (
                  <div className="text-sm text-muted-foreground">
                    This transaction is sponsored (gasless)
                  </div>
                )}
                {formatFeeBreakdown(feeInfo).length > 0 && (
                  <div className="text-sm space-y-1">
                    {formatFeeBreakdown(feeInfo).map((line, idx) => (
                      <div key={idx} className="text-muted-foreground">{line}</div>
                    ))}
                  </div>
                )}
                {process.env.NODE_ENV === 'development' && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Fee Debug Info</summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                      {JSON.stringify(
                        {
                          rawAmount: feeInfo.paymentToken.amount,
                          formattedAmount: feeInfo.paymentToken.formattedAmount,
                          tokenAddress: feeInfo.paymentToken.tokenAddress,
                          tokenSymbol: feeInfo.paymentToken.tokenSymbol,
                          chainId: feeInfo.paymentToken.chainId,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Execute Button */}
        <Button
          onClick={handleExecuteSupply}
          disabled={!orchestrator || !meeClient || isExecuting || !address}
          className="w-full"
        >
          {isExecuting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {executionStatus || 'Executing...'}
            </>
          ) : (
            'Execute Supply Flow'
          )}
        </Button>

        {/* Execution Status */}
        {executionStatus && !isExecuting && (
          <Alert>
            <AlertDescription>{executionStatus}</AlertDescription>
          </Alert>
        )}

        {executionError && parsedError && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">{formatErrorForDisplay(parsedError).title}</div>
                <div>{executionError}</div>
                {parsedError.suggestions && parsedError.suggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="text-sm font-medium">Suggestions:</div>
                    <ul className="text-sm list-disc list-inside space-y-1">
                      {parsedError.suggestions.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {process.env.NODE_ENV === 'development' && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Technical Details</summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                      {JSON.stringify(
                        {
                          category: parsedError.category,
                          code: parsedError.code,
                          originalMessage: parsedError.message,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
        {executionError && !parsedError && (
          <Alert variant="destructive">
            <AlertDescription>{executionError}</AlertDescription>
          </Alert>
        )}

        {/* Transaction Status */}
        {transactionHash && (
          <>
            <Alert>
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="font-medium">Transaction Status</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {txStatus === 'success' && '✅ Success'}
                        {txStatus === 'failed' && '❌ Failed'}
                        {txStatus === 'mining' && '⛏️ Mining'}
                        {txStatus === 'pending' && '⏳ Pending'}
                        {txStatus === 'unknown' && '❓ Unknown'}
                        {txStatus === 'idle' && '⏸️ Idle'}
                      </span>
                      {isStatusLoading && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-sm font-mono break-all">
                      Hash: {transactionHash}
                    </div>
                    <a
                      href={getMeeScanLink(transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline"
                    >
                      View on MEE Scan →
                    </a>
                  </div>

                  {receipt?.explorerLinks && receipt.explorerLinks.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Explorer Links:</div>
                      {receipt.explorerLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline block"
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  )}

                  {receipt?.userOps && receipt.userOps.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Chain Status:</div>
                      {receipt.userOps.map((op, idx) => (
                        <div key={idx} className="text-xs text-muted-foreground">
                          Chain {op.chainId}: {op.executionStatus}
                        </div>
                      ))}
                    </div>
                  )}

                  {txStatus === 'pending' || txStatus === 'mining' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshStatus}
                      disabled={isStatusLoading}
                    >
                      {isStatusLoading ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        'Refresh Status'
                      )}
                    </Button>
                  ) : null}
                </div>
              </AlertDescription>
            </Alert>

            {/* Detailed Transaction Information */}
            {parsedResponse && (
              <TransactionDetails 
                parsedResponse={parsedResponse} 
                showFullDetails={true}
              />
            )}
          </>
        )}

        <Separator className="my-6" />

        {/* Test Functions Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Test Functions</h3>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fee Extraction Test</CardTitle>
              <CardDescription>
                Test the fee extraction utility with mock quote data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    // Mock quote data similar to what Biconomy returns
                    const mockQuote = {
                      fee: {
                        amount: '1000000', // 1 USDC (6 decimals)
                        paymentToken: {
                          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                          chainId: 8453,
                          symbol: 'USDC',
                          decimals: 6,
                        },
                        usdValue: '1.00',
                        breakdown: {
                          gas: '500000',
                          bridge: '300000',
                          protocol: '200000',
                        },
                      },
                      sponsorship: null, // Not sponsored
                    };

                    const extracted = extractFeeFromQuote(mockQuote);
                    if (extracted) {
                      setTestFeeResult(
                        `✅ Fee extraction successful!\n` +
                        `Total: ${formatFeeForDisplay(extracted)}\n` +
                        `Breakdown:\n${formatFeeBreakdown(extracted).join('\n')}\n` +
                        `Sponsored: ${extracted.isSponsored ? 'Yes' : 'No'}`
                      );
                    } else {
                      setTestFeeResult('❌ Fee extraction returned null');
                    }
                  } catch (err) {
                    setTestFeeResult(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
              >
                Test Fee Extraction
              </Button>
              
              {testFeeResult && (
                <Alert>
                  <AlertDescription>
                    <pre className="whitespace-pre-wrap text-sm">{testFeeResult}</pre>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  try {
                    // Test sponsored transaction
                    const mockSponsoredQuote = {
                      fee: {
                        amount: '0',
                        paymentToken: {
                          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                          chainId: 8453,
                          symbol: 'USDC',
                          decimals: 6,
                        },
                      },
                      sponsorship: {
                        enabled: true,
                      },
                    };

                    const extracted = extractFeeFromQuote(mockSponsoredQuote);
                    if (extracted) {
                      setTestFeeResult(
                        `✅ Sponsored fee extraction successful!\n` +
                        `Total: ${formatFeeForDisplay(extracted)}\n` +
                        `Sponsored: ${extracted.isSponsored ? 'Yes' : 'No'}`
                      );
                    } else {
                      setTestFeeResult('❌ Sponsored fee extraction returned null');
                    }
                  } catch (err) {
                    setTestFeeResult(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }}
              >
                Test Sponsored Fee Extraction
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction Status Monitoring Test</CardTitle>
              <CardDescription>
                Test transaction status monitoring with a transaction hash
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testHash">Transaction Hash (for testing)</Label>
                <Input
                  id="testHash"
                  value={testHash}
                  onChange={(e) => setTestHash(e.target.value)}
                  placeholder="0x..."
                  className="font-mono"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!testHash) {
                      setTestStatusResult('❌ Please enter a transaction hash');
                      return;
                    }

                    try {
                      setTestStatusResult('⏳ Checking status...');
                      
                      // Test API status check
                      const response = await fetch(`/api/biconomy/status?hash=${encodeURIComponent(testHash)}`);
                      const responseText = await response.text();
                      
                      if (!response.ok) {
                        let errorData;
                        try {
                          errorData = JSON.parse(responseText);
                        } catch {
                          errorData = { message: responseText };
                        }
                        
                        setTestStatusResult(
                          `❌ API returned ${response.status}: ${response.statusText}\n` +
                          `Error: ${errorData.error || errorData.message || 'Unknown error'}\n` +
                          (errorData.suggestion ? `Suggestion: ${errorData.suggestion}\n` : '') +
                          (errorData.triedEndpoints ? `Tried endpoints: ${errorData.triedEndpoints.length}\n` : '') +
                          `\nNote: The status API only works with Biconomy supertransaction hashes.\n` +
                          `Regular transaction hashes won't work. Use the hash returned from\n` +
                          `meeClient.executeFusionQuote() or meeClient.executeQuote().`
                        );
                        return;
                      }
                      
                      const data = JSON.parse(responseText);
                      setTestStatusResult(
                        `✅ Status check successful!\n` +
                        `Status: ${data.transactionStatus || data.status || 'Unknown'}\n` +
                        `Explorer Links: ${data.explorerLinks?.length || 0}\n` +
                        `User Ops: ${data.userOps?.length || 0}\n` +
                        `\nFull Response:\n${JSON.stringify(data, null, 2)}`
                      );
                    } catch (err) {
                      setTestStatusResult(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                >
                  Test Status API
                </Button>

                {transactionHash && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        setTestStatusResult('⏳ Refreshing status via hook...');
                        await refreshStatus();
                        setTestStatusResult(
                          `✅ Status refreshed!\n` +
                          `Current Status: ${txStatus}\n` +
                          `Is Loading: ${isStatusLoading}\n` +
                          `Receipt: ${receipt ? 'Available' : 'Not available'}\n` +
                          `Explorer Links: ${receipt?.explorerLinks?.length || 0}\n` +
                          `User Ops: ${receipt?.userOps?.length || 0}`
                        );
                      } catch (err) {
                        setTestStatusResult(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                  >
                    Test Hook Refresh
                  </Button>
                )}
              </div>

              {testStatusResult && (
                <Alert>
                  <AlertDescription>
                    <pre className="whitespace-pre-wrap text-sm">{testStatusResult}</pre>
                  </AlertDescription>
                </Alert>
              )}

              {transactionHash && (
                <Alert>
                  <AlertDescription>
                    <div className="space-y-2 text-sm">
                      <div className="font-medium">Current Hook Status:</div>
                      <div>Status: <strong>{txStatus}</strong></div>
                      <div>Loading: {isStatusLoading ? 'Yes' : 'No'}</div>
                      {receipt && (
                        <>
                          <div>Transaction Status: {receipt.transactionStatus}</div>
                          {receipt.explorerLinks && receipt.explorerLinks.length > 0 && (
                            <div>
                              Explorer Links: {receipt.explorerLinks.length}
                              <ul className="list-disc list-inside ml-2">
                                {receipt.explorerLinks.slice(0, 3).map((link, idx) => (
                                  <li key={idx} className="text-xs break-all">{link}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {receipt.userOps && receipt.userOps.length > 0 && (
                            <div>
                              User Ops: {receipt.userOps.length}
                              <ul className="list-disc list-inside ml-2">
                                {receipt.userOps.map((op, idx) => (
                                  <li key={idx} className="text-xs">
                                    Chain {op.chainId}: {op.executionStatus}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integration Test</CardTitle>
              <CardDescription>
                Test the complete flow: Get quote → Extract fee → Execute → Monitor status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${orchestrator && meeClient ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span>Orchestrator Initialized: {orchestrator && meeClient ? '✅' : '❌'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${feeInfo ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span>Fee Info Available: {feeInfo ? '✅' : '❌'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${transactionHash ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span>Transaction Hash: {transactionHash ? '✅' : '❌'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${txStatus !== 'idle' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span>Status Monitoring Active: {txStatus !== 'idle' ? '✅' : '❌'}</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  const results = [
                    `Integration Test Results:`,
                    ``,
                    `1. Orchestrator: ${orchestrator && meeClient ? '✅ Initialized' : '❌ Not initialized'}`,
                    `2. Fee Extraction: ${feeInfo ? `✅ Available (${formatFeeForDisplay(feeInfo)})` : '❌ Not available'}`,
                    `3. Transaction Hash: ${transactionHash ? `✅ ${transactionHash}` : '❌ Not set'}`,
                    `4. Status Monitoring: ${txStatus !== 'idle' ? `✅ Active (${txStatus})` : '❌ Not active'}`,
                    `5. Receipt Data: ${receipt ? `✅ Available` : '❌ Not available'}`,
                    ``,
                    `All systems: ${orchestrator && meeClient && feeInfo && transactionHash && txStatus !== 'idle' ? '✅ READY' : '⚠️ PARTIAL'}`,
                  ];
                  setTestStatusResult(results.join('\n'));
                }}
              >
                Run Integration Test
              </Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

