/**
 * Utility functions for building Biconomy supply flow instructions
 * Uses the new SDK approach with buildComposable
 */

import type { Address } from 'viem';
import { bsc } from 'viem/chains';
import type { MultichainSmartAccount } from '@biconomy/abstractjs';
import { runtimeERC20BalanceOf, greaterThanOrEqualTo } from '@biconomy/abstractjs';
import { erc20Abi } from 'viem';
import { PERIDOT_CONTROLLER, getUnderlyingToken } from '../biconomy/constants';

export interface SupplyFlowParams {
  orchestrator: MultichainSmartAccount;
  userAddress: Address;
  sourceChainId: number;
  sourceToken: Address;
  supplyMarket: Address; // pToken address on BSC
  supplyAmount: bigint;
  enableAsCollateral?: boolean;
  returnPTokens?: boolean;
  slippage?: number;
}

/**
 * Build all instructions for cross-chain supply flow
 */
export async function buildSupplyFlowInstructions(
  params: SupplyFlowParams
): Promise<Awaited<ReturnType<MultichainSmartAccount['buildComposable']>>[]> {
  const {
    orchestrator,
    userAddress,
    sourceChainId,
    sourceToken,
    supplyMarket,
    supplyAmount,
    enableAsCollateral = true,
    returnPTokens = true,
    slippage = 0.01,
  } = params;

  const underlyingToken = getUnderlyingToken(supplyMarket);
  const bscChainId = bsc.id;

  const instructions: Awaited<ReturnType<MultichainSmartAccount['buildComposable']>>[] = [];

  // Step 1: Bridge tokens from source chain to BSC using intent-simple
  // Note: For now we'll use buildComposable with type 'default' to encode the intent
  // The SDK may provide a helper for intent-simple in the future
  const bridgeInstruction = await orchestrator.buildComposable({
    type: 'default',
    data: {
      chainId: sourceChainId,
      abi: [
        {
          name: 'swap',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [],
          outputs: [],
        },
      ],
      to: '0x0000000000000000000000000000000000000000', // Placeholder - will be handled by intent-simple
      functionName: 'swap',
      args: [],
    },
  });

  // For now, we'll need to use the API approach for intent-simple
  // This is a limitation until the SDK provides better support
  // We'll build the instructions that can be built with buildComposable

  // Step 2: Approve pToken contract to spend underlying token
  const approveInstruction = await orchestrator.buildComposable({
    type: 'approve',
    data: {
      spender: supplyMarket,
      tokenAddress: underlyingToken,
      chainId: bscChainId,
      amount: runtimeERC20BalanceOf({
        tokenAddress: underlyingToken,
        targetAddress: orchestrator.addressOn(bscChainId, true),
        constraints: [greaterThanOrEqualTo(1n)],
      }),
    },
  });

  instructions.push(approveInstruction);

  // Step 3: Mint pTokens by supplying underlying
  const mintInstruction = await orchestrator.buildComposable({
    type: 'default',
    data: {
      chainId: bscChainId,
      abi: [
        {
          name: 'mint',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: 'mintAmount', type: 'uint256' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ],
      to: supplyMarket,
      functionName: 'mint',
      args: [
        runtimeERC20BalanceOf({
          tokenAddress: underlyingToken,
          targetAddress: orchestrator.addressOn(bscChainId, true),
          constraints: [greaterThanOrEqualTo(1n)],
        }),
      ],
    },
  });

  instructions.push(mintInstruction);

  // Step 4: Enable as collateral if requested
  if (enableAsCollateral) {
    const enterMarketsInstruction = await orchestrator.buildComposable({
      type: 'default',
      data: {
        chainId: bscChainId,
        abi: [
          {
            name: 'enterMarkets',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [{ name: 'cTokens', type: 'address[]' }],
            outputs: [{ name: '', type: 'uint256[]' }],
          },
        ],
        to: PERIDOT_CONTROLLER,
        functionName: 'enterMarkets',
        args: [[supplyMarket]],
      },
    });

    instructions.push(enterMarketsInstruction);
  }

  // Step 5: Transfer pTokens back to user's EOA (for Fusion mode)
  if (returnPTokens) {
    const transferInstruction = await orchestrator.buildComposable({
      type: 'default',
      data: {
        chainId: bscChainId,
        abi: erc20Abi,
        to: supplyMarket,
        functionName: 'transfer',
        args: [
          userAddress,
          runtimeERC20BalanceOf({
            tokenAddress: supplyMarket,
            targetAddress: orchestrator.addressOn(bscChainId, true),
            constraints: [greaterThanOrEqualTo(1n)],
          }),
        ],
      },
    });

    instructions.push(transferInstruction);
  }

  return instructions;
}

/**
 * Build a cross-chain swap instruction using intent-simple
 * Note: This requires API integration until SDK provides direct support
 */
export async function buildCrossChainSwapInstruction(
  orchestrator: MultichainSmartAccount,
  sourceChainId: number,
  sourceToken: Address,
  dstChainId: number,
  dstToken: Address,
  amount: bigint,
  slippage: number = 0.01
): Promise<Awaited<ReturnType<MultichainSmartAccount['buildComposable']>>> {
  // For now, we'll need to handle this via API
  // The SDK's buildComposable doesn't directly support intent-simple
  // This is a placeholder that will need to be integrated with the API
  throw new Error(
    'Cross-chain swap via intent-simple requires API integration. Use the Biconomy API directly for this step.'
  );
}



