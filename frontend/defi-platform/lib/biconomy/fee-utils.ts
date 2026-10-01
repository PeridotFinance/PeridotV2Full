'use client';

import { formatUnits, type Address } from 'viem';

export interface FeeDetails {
  amount: string; // Raw amount in wei/smallest unit
  formattedAmount: string; // Human-readable amount
  tokenAddress: Address | string;
  tokenSymbol?: string;
  chainId?: number;
  usdValue?: string; // USD value if available
  breakdown?: {
    gas?: string;
    bridge?: string;
    protocol?: string;
  };
}

export interface FeeInfo {
  total: FeeDetails;
  paymentToken: FeeDetails;
  isSponsored?: boolean;
  estimatedGas?: string;
}

/**
 * Extract fee information from Biconomy quote response
 */
export function extractFeeFromQuote(quote: any): FeeInfo | null {
  if (!quote) return null;

  try {
    // Try to extract fee from various possible structures
    const fee = quote.fee || quote.feeInfo || quote.cost || {};
    
    // Payment token info
    const paymentToken = fee.paymentToken || fee.token || fee.feeToken || {};
    const paymentTokenAddress = paymentToken.address || paymentToken.tokenAddress || '';
    const paymentTokenChainId = paymentToken.chainId || paymentToken.chain;
    
    // Amount
    const rawAmount = fee.amount || fee.total || fee.value || fee.cost || '0';
    
    // Determine decimals - try multiple sources
    let decimals = paymentToken.decimals;
    
    // If decimals not provided, try to infer from token address
    if (!decimals && paymentTokenAddress) {
      decimals = getTokenDecimalsFromAddress(paymentTokenAddress);
    }
    
    // Default to 18 if still not found
    if (!decimals) {
      decimals = 18;
    }
    
    // Try to get token symbol from common sources
    const tokenSymbol = paymentToken.symbol || 
                       paymentToken.tokenSymbol || 
                       (paymentTokenAddress ? getTokenSymbolFromAddress(paymentTokenAddress) : undefined);

    const formattedAmount = formatUnits(BigInt(rawAmount), decimals);

    // USD value if available
    const usdValue = fee.usdValue || fee.usd || fee.estimatedUsdValue;

    // Breakdown
    const breakdown = fee.breakdown ? {
      gas: fee.breakdown.gas ? formatUnits(BigInt(fee.breakdown.gas), decimals) : undefined,
      bridge: fee.breakdown.bridge ? formatUnits(BigInt(fee.breakdown.bridge), decimals) : undefined,
      protocol: fee.breakdown.protocol ? formatUnits(BigInt(fee.breakdown.protocol), decimals) : undefined,
    } : undefined;

    // Check if sponsored
    const isSponsored = quote.sponsorship !== undefined && quote.sponsorship !== null;

    return {
      total: {
        amount: rawAmount,
        formattedAmount,
        tokenAddress: paymentTokenAddress,
        tokenSymbol,
        chainId: paymentTokenChainId,
        usdValue,
        breakdown,
      },
      paymentToken: {
        amount: rawAmount,
        formattedAmount,
        tokenAddress: paymentTokenAddress,
        tokenSymbol,
        chainId: paymentTokenChainId,
        usdValue,
      },
      isSponsored,
      estimatedGas: fee.estimatedGas || fee.gas || undefined,
    };
  } catch (err) {
    console.warn('[extractFeeFromQuote] Failed to extract fee:', err);
    return null;
  }
}

/**
 * Format fee for display with proper precision
 */
export function formatFeeForDisplay(feeInfo: FeeInfo | null): string {
  if (!feeInfo) return 'N/A';

  if (feeInfo.isSponsored) {
    return 'Sponsored (Free)';
  }

  const { paymentToken } = feeInfo;
  let amount = paymentToken.formattedAmount || '0';
  const symbol = paymentToken.tokenSymbol || 'tokens';
  
  // Remove trailing zeros and format to reasonable precision
  const numAmount = parseFloat(amount);
  if (!isNaN(numAmount)) {
    // Format to show significant digits, max 6 decimal places
    if (numAmount < 0.000001) {
      amount = numAmount.toExponential(2);
    } else if (numAmount < 1) {
      amount = numAmount.toFixed(6).replace(/\.?0+$/, '');
    } else {
      amount = numAmount.toFixed(4).replace(/\.?0+$/, '');
    }
  }
  
  if (paymentToken.usdValue) {
    return `${amount} ${symbol} (~$${paymentToken.usdValue})`;
  }

  return `${amount} ${symbol}`;
}

/**
 * Get token symbol from address (basic mapping)
 * In production, you'd want to fetch this from a token list or on-chain
 */
export function getTokenSymbolFromAddress(address: Address | string): string | undefined {
  const addr = address.toLowerCase();
  
  // Common token addresses (add more as needed)
  const tokenMap: Record<string, string> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC', // Base
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': 'USDT', // Optimism
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC', // Arbitrum
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC', // Polygon
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC', // Ethereum
    '0x55d398326f99059ff775485246999027b3197955': 'USDT', // BSC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC', // BSC
  };

  return tokenMap[addr];
}

/**
 * Get token decimals from address (basic mapping)
 * In production, you'd want to fetch this from a token list or on-chain
 */
export function getTokenDecimalsFromAddress(address: Address | string): number | undefined {
  const addr = address.toLowerCase();
  
  // Common token addresses with their decimals
  const decimalsMap: Record<string, number> = {
    // USDC (6 decimals)
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // Base
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // Arbitrum
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 6, // Polygon
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, // Ethereum
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 6, // BSC
    // USDT (6 decimals)
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': 6, // Optimism
    '0x55d398326f99059ff775485246999027b3197955': 6, // BSC
    // WETH, WBNB, WBTC (18 decimals)
    '0x4200000000000000000000000000000000000006': 18, // WETH Base
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 18, // WETH Arbitrum
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8': 18, // ETH BSC
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 18, // WBNB BSC
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8, // WBTC Ethereum
  };

  return decimalsMap[addr];
}

/**
 * Format fee breakdown for display
 */
export function formatFeeBreakdown(feeInfo: FeeInfo | null): string[] {
  if (!feeInfo || !feeInfo.total.breakdown) return [];

  const breakdown = feeInfo.total.breakdown;
  const symbol = feeInfo.paymentToken.tokenSymbol || 'tokens';
  const lines: string[] = [];

  if (breakdown.gas) {
    lines.push(`Gas: ${breakdown.gas} ${symbol}`);
  }
  if (breakdown.bridge) {
    lines.push(`Bridge: ${breakdown.bridge} ${symbol}`);
  }
  if (breakdown.protocol) {
    lines.push(`Protocol: ${breakdown.protocol} ${symbol}`);
  }

  return lines;
}

