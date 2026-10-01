'use client';

import { formatUnits, type Address } from 'viem';
import { getTokenSymbolFromAddress, getTokenDecimalsFromAddress } from './fee-utils';

/**
 * Parsed token transfer information
 */
export interface ParsedTokenTransfer {
  type: 'native' | 'erc20';
  tokenAddress: Address | string;
  tokenSymbol?: string;
  tokenName?: string;
  decimals: number;
  fromAddress: Address | string;
  toAddress: Address | string;
  amount: string; // Raw amount in wei/smallest unit
  formattedAmount: string; // Human-readable amount
  chainId: number;
}

/**
 * Parsed user operation information
 */
export interface ParsedUserOperation {
  chainId: number;
  userOpHash: string;
  meeUserOpHash?: string;
  executionStatus: string;
  isConfirmed: boolean;
  isCleanUpUserOp: boolean;
  actualGasCost: string;
  formattedGasCost: string;
  miningTimestamp?: number;
  minedTimestamp?: number;
  revertError?: string;
  tokenTransfers: ParsedTokenTransfer[];
  nativeTransfers: ParsedTokenTransfer[];
}

/**
 * Parsed payment information
 */
export interface ParsedPaymentInfo {
  tokenAddress: Address | string;
  tokenSymbol?: string;
  chainId: number;
  tokenAmount: string;
  formattedTokenAmount: string;
  gasFee: string;
  formattedGasFee: string;
  orchestrationFee: string;
  formattedOrchestrationFee: string;
  totalFee: string;
  formattedTotalFee: string;
  sponsored: boolean;
  eoa: Address | string;
}

/**
 * Parsed trigger information
 */
export interface ParsedTrigger {
  tokenAddress: Address | string;
  tokenSymbol?: string;
  chainId: number;
  amount: string;
  formattedAmount: string;
}

/**
 * Complete parsed transaction response
 */
export interface ParsedTransactionResponse {
  itxHash: string;
  node: Address | string;
  overallStatus: 'success' | 'partial_success' | 'failed' | 'pending';
  paymentInfo: ParsedPaymentInfo;
  trigger?: ParsedTrigger;
  userOps: ParsedUserOperation[];
  totalGasCost: string;
  formattedTotalGasCost: string;
  chainsInvolved: number[];
  tokensInvolved: Array<{
    address: Address | string;
    symbol?: string;
    chainId: number;
  }>;
  summary: {
    totalTransfers: number;
    successfulOps: number;
    failedOps: number;
    hasErrors: boolean;
    errors: string[];
  };
}

/**
 * Parse raw Biconomy transaction response into structured data
 */
export function parseBiconomyTransactionResponse(
  response: any
): ParsedTransactionResponse | null {
  if (!response) return null;

  try {
    const itxHash = response.itxHash || response.hash || response.superTxHash || '';
    const node = response.node || '';
    
    // Parse payment info
    const paymentInfoRaw = response.paymentInfo || {};
    const paymentTokenAddress = paymentInfoRaw.token || '';
    const paymentTokenDecimals = getTokenDecimalsFromAddress(paymentTokenAddress) || 6;
    const paymentTokenSymbol = paymentInfoRaw.tokenSymbol || getTokenSymbolFromAddress(paymentTokenAddress) || 'tokens';
    
    const paymentInfo: ParsedPaymentInfo = {
      tokenAddress: paymentTokenAddress,
      tokenSymbol: paymentTokenSymbol,
      chainId: Number(paymentInfoRaw.chainId) || 0,
      tokenAmount: paymentInfoRaw.tokenWeiAmount || paymentInfoRaw.tokenAmount || '0',
      formattedTokenAmount: formatUnits(
        BigInt(paymentInfoRaw.tokenWeiAmount || paymentInfoRaw.tokenAmount || '0'),
        paymentTokenDecimals
      ),
      gasFee: paymentInfoRaw.gasFee || '0',
      formattedGasFee: paymentInfoRaw.gasFee || '0',
      orchestrationFee: paymentInfoRaw.orchestrationFee || '0',
      formattedOrchestrationFee: paymentInfoRaw.orchestrationFee || '0',
      totalFee: (
        parseFloat(paymentInfoRaw.gasFee || '0') + 
        parseFloat(paymentInfoRaw.orchestrationFee || '0')
      ).toString(),
      formattedTotalFee: (
        parseFloat(paymentInfoRaw.gasFee || '0') + 
        parseFloat(paymentInfoRaw.orchestrationFee || '0')
      ).toString(),
      sponsored: paymentInfoRaw.sponsored === true,
      eoa: paymentInfoRaw.eoa || '',
    };

    // Parse trigger
    const triggerRaw = response.trigger;
    let trigger: ParsedTrigger | undefined;
    if (triggerRaw) {
      const triggerTokenDecimals = getTokenDecimalsFromAddress(triggerRaw.token) || 6;
      trigger = {
        tokenAddress: triggerRaw.token || '',
        tokenSymbol: getTokenSymbolFromAddress(triggerRaw.token),
        chainId: Number(triggerRaw.chainId) || 0,
        amount: triggerRaw.amount || '0',
        formattedAmount: formatUnits(BigInt(triggerRaw.amount || '0'), triggerTokenDecimals),
      };
    }

    // Parse user operations
    const userOpsRaw = response.userOps || [];
    const userOps: ParsedUserOperation[] = [];
    const chainsInvolved = new Set<number>();
    const tokensInvolved = new Map<string, { address: Address | string; symbol?: string; chainId: number }>();
    const errors: string[] = [];
    let totalGasCost = BigInt(0);

    for (const userOpRaw of userOpsRaw) {
      const chainId = Number(userOpRaw.chainId) || 0;
      chainsInvolved.add(chainId);

      // Parse token transfers
      const stateTransitions = userOpRaw.stateTransitions || {};
      const assetTransfers = stateTransitions.assetTransfers || {};
      
      const tokenTransfers: ParsedTokenTransfer[] = [];
      const nativeTransfers: ParsedTokenTransfer[] = [];

      // Parse ERC20 transfers
      const erc20Transfers = assetTransfers.erc20TokenTransfers || [];
      for (const transfer of erc20Transfers) {
        const decimals = transfer.decimals || getTokenDecimalsFromAddress(transfer.tokenAddress) || 18;
        const symbol = transfer.symbol || getTokenSymbolFromAddress(transfer.tokenAddress);
        
        tokenTransfers.push({
          type: 'erc20',
          tokenAddress: transfer.tokenAddress,
          tokenSymbol: symbol,
          tokenName: transfer.name,
          decimals,
          fromAddress: transfer.fromAddress,
          toAddress: transfer.toAddress,
          amount: transfer.amount,
          formattedAmount: formatUnits(BigInt(transfer.amount || '0'), decimals),
          chainId: Number(transfer.chainId) || chainId,
        });

        // Track tokens
        const tokenKey = `${transfer.tokenAddress}-${transfer.chainId}`;
        if (!tokensInvolved.has(tokenKey)) {
          tokensInvolved.set(tokenKey, {
            address: transfer.tokenAddress,
            symbol,
            chainId: Number(transfer.chainId) || chainId,
          });
        }
      }

      // Parse native token transfers
      const nativeTransfersRaw = assetTransfers.nativeTokenTransfers || [];
      for (const transfer of nativeTransfersRaw) {
        nativeTransfers.push({
          type: 'native',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          tokenSymbol: getNativeTokenSymbol(Number(transfer.chainId) || chainId),
          decimals: 18,
          fromAddress: transfer.fromAddress,
          toAddress: transfer.toAddress,
          amount: transfer.amount,
          formattedAmount: formatUnits(BigInt(transfer.amount || '0'), 18),
          chainId: Number(transfer.chainId) || chainId,
        });
      }

      // Calculate gas cost
      const actualGasCost = BigInt(userOpRaw.actualGasCost || '0');
      totalGasCost += actualGasCost;

      // Track errors
      if (userOpRaw.revertError) {
        errors.push(`Chain ${chainId}: ${userOpRaw.revertError}`);
      }

      userOps.push({
        chainId,
        userOpHash: userOpRaw.userOpHash || '',
        meeUserOpHash: userOpRaw.meeUserOpHash,
        executionStatus: userOpRaw.executionStatus || 'PENDING',
        isConfirmed: userOpRaw.isConfirmed === true,
        isCleanUpUserOp: userOpRaw.isCleanUpUserOp === true,
        actualGasCost: actualGasCost.toString(),
        formattedGasCost: formatUnits(actualGasCost, 18),
        miningTimestamp: userOpRaw.miningTimestamp,
        minedTimestamp: userOpRaw.minedTimestamp,
        revertError: userOpRaw.revertError,
        tokenTransfers,
        nativeTransfers,
      });
    }

    // Determine overall status
    const successfulOps = userOps.filter(op => 
      op.executionStatus === 'MINED_SUCCESS' && op.isConfirmed
    ).length;
    const failedOps = userOps.filter(op => 
      op.executionStatus === 'MINED_FAIL' || op.revertError
    ).length;
    const pendingOps = userOps.filter(op => 
      op.executionStatus === 'PENDING' || !op.isConfirmed
    ).length;

    let overallStatus: 'success' | 'partial_success' | 'failed' | 'pending';
    if (failedOps > 0 && successfulOps === 0) {
      overallStatus = 'failed';
    } else if (failedOps > 0 && successfulOps > 0) {
      overallStatus = 'partial_success';
    } else if (pendingOps > 0) {
      overallStatus = 'pending';
    } else {
      overallStatus = 'success';
    }

    return {
      itxHash,
      node,
      overallStatus,
      paymentInfo,
      trigger,
      userOps,
      totalGasCost: totalGasCost.toString(),
      formattedTotalGasCost: formatUnits(totalGasCost, 18),
      chainsInvolved: Array.from(chainsInvolved),
      tokensInvolved: Array.from(tokensInvolved.values()),
      summary: {
        totalTransfers: userOps.reduce((sum, op) => sum + op.tokenTransfers.length + op.nativeTransfers.length, 0),
        successfulOps,
        failedOps,
        hasErrors: errors.length > 0,
        errors,
      },
    };
  } catch (err) {
    console.error('[parseBiconomyTransactionResponse] Failed to parse:', err);
    return null;
  }
}

/**
 * Get native token symbol for a chain
 */
function getNativeTokenSymbol(chainId: number): string {
  const chainTokenMap: Record<number, string> = {
    1: 'ETH',
    56: 'BNB',
    137: 'MATIC',
    42161: 'ETH',
    8453: 'ETH',
    10: 'ETH',
    43114: 'AVAX',
  };
  return chainTokenMap[chainId] || 'ETH';
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: ParsedTransactionResponse['overallStatus']): string {
  switch (status) {
    case 'success':
      return 'Transaction completed successfully';
    case 'partial_success':
      return 'Transaction partially completed';
    case 'failed':
      return 'Transaction failed';
    case 'pending':
      return 'Transaction pending';
    default:
      return 'Unknown status';
  }
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: ParsedTransactionResponse['overallStatus']): string {
  switch (status) {
    case 'success':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'partial_success':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'failed':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'pending':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}



