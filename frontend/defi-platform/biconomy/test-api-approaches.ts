/**
 * Test script to compare REST API vs SDK approaches for Biconomy
 * 
 * This script tests:
 * 1. Old REST API approach (direct fetch to /v1/instructions/compose)
 * 2. New SDK approach (toMultichainNexusAccount, createMeeClient, etc.)
 * 
 * Usage:
 *   pnpm tsx biconomy/test-api-approaches.ts
 *   or
 *   node --loader tsx biconomy/test-api-approaches.ts
 */

import {
  toMultichainNexusAccount,
  createMeeClient,
  getMeeScanLink,
  runtimeERC20BalanceOf,
  getMEEVersion,
  MEEVersion,
  type Trigger,
} from '@biconomy/abstractjs';
import { http, parseUnits, type Address, type Chain } from 'viem';
import { bsc, arbitrum, base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { erc20Abi } from 'viem';

// Configuration
const BICONOMY_API_URL = 'https://api.biconomy.io';
const API_KEY = process.env.NEXT_PUBLIC_BICONOMY_APIKEY || process.env.BICONOMY_API_KEY || '';

// Test parameters
const TEST_USER_ADDRESS = process.env.TEST_USER_ADDRESS as Address || '0x0000000000000000000000000000000000000000';
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY as `0x${string}` | undefined;

// Example addresses (adjust based on your setup)
const USDC_ARBITRUM = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as Address;
const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address;
const TEST_AMOUNT = parseUnits('1', 6); // 1 USDC

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
  endpoint?: string;
  method?: string;
}

/**
 * Test 1: Old REST API - Compose Endpoint
 */
async function testRestComposeEndpoint(): Promise<TestResult> {
  console.log('\n📡 Testing REST API: /v1/instructions/compose');
  
  if (!API_KEY) {
    return {
      name: 'REST Compose Endpoint',
      success: false,
      error: 'Missing BICONOMY_API_KEY environment variable',
    };
  }

  const composeBody = {
    ownerAddress: TEST_USER_ADDRESS,
    mode: 'eoa',
    composeFlows: [
      {
        type: '/instructions/intent-simple',
        data: {
          srcToken: USDC_ARBITRUM,
          dstToken: USDC_BSC,
          srcChainId: arbitrum.id,
          dstChainId: bsc.id,
          amount: TEST_AMOUNT.toString(),
          slippage: 0.1,
        },
      },
      {
        type: '/instructions/build',
        data: {
          functionSignature: 'function approve(address,uint256)',
          args: [
            '0x0000000000000000000000000000000000000000', // placeholder
            { type: 'runtimeErc20Balance', tokenAddress: USDC_BSC },
          ],
          to: USDC_BSC,
          chainId: bsc.id,
          value: '0',
        },
      },
    ],
  };

  try {
    const response = await fetch(`${BICONOMY_API_URL}/v1/instructions/compose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(composeBody),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return {
        name: 'REST Compose Endpoint',
        success: false,
        error: `HTTP ${response.status}: ${text}`,
        endpoint: '/v1/instructions/compose',
        method: 'POST',
        data,
      };
    }

    return {
      name: 'REST Compose Endpoint',
      success: true,
      endpoint: '/v1/instructions/compose',
      method: 'POST',
      data: {
        instructionsCount: Array.isArray(data.instructions) ? data.instructions.length : 0,
        hasInstructions: Array.isArray(data.instructions) && data.instructions.length > 0,
      },
    };
  } catch (error: any) {
    return {
      name: 'REST Compose Endpoint',
      success: false,
      error: error.message || String(error),
      endpoint: '/v1/instructions/compose',
      method: 'POST',
    };
  }
}

/**
 * Test 2: REST API - Quote Endpoint (NEW: with composeFlows)
 */
async function testRestQuoteEndpoint(): Promise<TestResult> {
  console.log('\n📡 Testing REST API: /v1/quote (NEW - with composeFlows)');
  
  if (!API_KEY) {
    return {
      name: 'REST Quote Endpoint',
      success: false,
      error: 'Missing BICONOMY_API_KEY environment variable',
    };
  }

  // NEW API: Pass composeFlows directly to quote (no compose step needed)
  // Note: Using sponsorship mode to avoid funding requirements for testing
  const quoteBody = {
    ownerAddress: TEST_USER_ADDRESS,
    mode: 'smart-account', // Use smart-account mode for sponsored transactions (no funding needed)
    composeFlows: [
      {
        type: '/instructions/intent-simple',
        data: {
          srcToken: USDC_ARBITRUM,
          dstToken: USDC_BSC,
          srcChainId: arbitrum.id,
          dstChainId: bsc.id,
        amount: TEST_AMOUNT.toString(),
          slippage: 0.1,
        },
      },
    ],
    // For smart-account mode, fundingTokens are optional (sponsorship handles it)
    // For eoa mode, would need: fundingTokens and feeToken
  };

  try {
    // Try new endpoint first
    let response = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(quoteBody),
    });

    // If new endpoint fails, try old endpoint for comparison
    if (!response.ok && response.status === 404) {
      console.log('  ⚠️  /v1/quote returned 404, trying /v1/mee/quote for comparison');
      response = await fetch(`${BICONOMY_API_URL}/v1/mee/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(quoteBody),
      });
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return {
        name: 'REST Quote Endpoint',
        success: false,
        error: `HTTP ${response.status}: ${text}`,
        endpoint: '/v1/quote',
        method: 'POST',
        data,
      };
    }

    return {
      name: 'REST Quote Endpoint',
      success: true,
      endpoint: '/v1/quote',
      method: 'POST',
      data: {
        hasQuote: Boolean(data.quote || data.result?.quote),
        hasFee: Boolean(data.fee),
        hasPayloads: Boolean(data.payloadToSign || data.payloads),
        quoteType: data.quoteType || data.type,
      },
    };
  } catch (error: any) {
    return {
      name: 'REST Quote Endpoint',
      success: false,
      error: error.message || String(error),
      endpoint: '/v1/quote',
      method: 'POST',
    };
  }
}

/**
 * Test 3: New SDK Approach - Create Orchestrator
 */
async function testSdkOrchestrator(): Promise<TestResult> {
  console.log('\n🔧 Testing SDK: toMultichainNexusAccount');
  
  if (!TEST_PRIVATE_KEY) {
    return {
      name: 'SDK Orchestrator Creation',
      success: false,
      error: 'Missing TEST_PRIVATE_KEY environment variable (needed for SDK tests)',
    };
  }

  try {
    const eoa = privateKeyToAccount(TEST_PRIVATE_KEY);
    
    const orchestrator = await toMultichainNexusAccount({
      signer: eoa,
      chainConfigurations: [
        {
          chain: arbitrum,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
        },
        {
          chain: bsc,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
        },
      ],
    });

    const arbitrumAddress = orchestrator.addressOn(arbitrum.id);
    const bscAddress = orchestrator.addressOn(bsc.id);

    return {
      name: 'SDK Orchestrator Creation',
      success: true,
      data: {
        arbitrumAddress,
        bscAddress,
        hasAddresses: Boolean(arbitrumAddress && bscAddress),
      },
    };
  } catch (error: any) {
    return {
      name: 'SDK Orchestrator Creation',
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Test 4: New SDK Approach - Create MEE Client
 */
async function testSdkMeeClient(): Promise<TestResult> {
  console.log('\n🔧 Testing SDK: createMeeClient');
  
  if (!TEST_PRIVATE_KEY) {
    return {
      name: 'SDK MEE Client Creation',
      success: false,
      error: 'Missing TEST_PRIVATE_KEY environment variable',
    };
  }

  try {
    const eoa = privateKeyToAccount(TEST_PRIVATE_KEY);
    
    const orchestrator = await toMultichainNexusAccount({
      signer: eoa,
      chainConfigurations: [
        {
          chain: bsc,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
        },
      ],
    });

    const meeClient = await createMeeClient({ account: orchestrator });

    return {
      name: 'SDK MEE Client Creation',
      success: true,
      data: {
        clientCreated: Boolean(meeClient),
        hasGetFusionQuote: typeof meeClient.getFusionQuote === 'function',
        hasExecuteFusionQuote: typeof meeClient.executeFusionQuote === 'function',
      },
    };
  } catch (error: any) {
    return {
      name: 'SDK MEE Client Creation',
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Test 5: New SDK Approach - Build Composable Instructions
 */
async function testSdkBuildComposable(): Promise<TestResult> {
  console.log('\n🔧 Testing SDK: orchestrator.buildComposable');
  
  if (!TEST_PRIVATE_KEY) {
    return {
      name: 'SDK Build Composable',
      success: false,
      error: 'Missing TEST_PRIVATE_KEY environment variable',
    };
  }

  try {
    const eoa = privateKeyToAccount(TEST_PRIVATE_KEY);
    
    const orchestrator = await toMultichainNexusAccount({
      signer: eoa,
      chainConfigurations: [
        {
          chain: bsc,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
        },
      ],
    });

    // Test building an approve instruction
    const approveInstruction = await orchestrator.buildComposable({
      type: 'approve',
      data: {
        spender: '0x0000000000000000000000000000000000000000' as Address,
        tokenAddress: USDC_BSC,
        chainId: bsc.id,
        amount: TEST_AMOUNT,
      },
    });

    // Test building a default instruction
    const transferInstruction = await orchestrator.buildComposable({
      type: 'default',
      data: {
        abi: erc20Abi,
        chainId: bsc.id,
        to: USDC_BSC,
        functionName: 'transfer',
        args: [
          TEST_USER_ADDRESS,
          TEST_AMOUNT,
        ],
      },
    });

    return {
      name: 'SDK Build Composable',
      success: true,
      data: {
        approveBuilt: Boolean(approveInstruction),
        transferBuilt: Boolean(transferInstruction),
        instructionsCount: 2,
      },
    };
  } catch (error: any) {
    return {
      name: 'SDK Build Composable',
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Test 6: New SDK Approach - Get Fusion Quote
 */
async function testSdkFusionQuote(): Promise<TestResult> {
  console.log('\n🔧 Testing SDK: meeClient.getFusionQuote');
  
  if (!TEST_PRIVATE_KEY) {
    return {
      name: 'SDK Fusion Quote',
      success: false,
      error: 'Missing TEST_PRIVATE_KEY environment variable',
    };
  }

  try {
    const eoa = privateKeyToAccount(TEST_PRIVATE_KEY);
    
    const orchestrator = await toMultichainNexusAccount({
      signer: eoa,
      chainConfigurations: [
        {
          chain: bsc,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
        },
      ],
    });

    const meeClient = await createMeeClient({ account: orchestrator });

    // Build a simple instruction
    const instruction = await orchestrator.buildComposable({
      type: 'default',
      data: {
        abi: erc20Abi,
        chainId: bsc.id,
        to: USDC_BSC,
        functionName: 'transfer',
        args: [
          TEST_USER_ADDRESS,
          TEST_AMOUNT,
        ],
      },
    });

    // Create trigger
    const trigger: Trigger = {
      chainId: bsc.id,
      tokenAddress: USDC_BSC,
      amount: TEST_AMOUNT,
    };

    // Get fusion quote
    const quote = await meeClient.getFusionQuote({
      instructions: [instruction],
      trigger,
      feeToken: {
        address: USDC_BSC,
        chainId: bsc.id,
      },
    });

    return {
      name: 'SDK Fusion Quote',
      success: true,
      data: {
        hasQuote: Boolean(quote),
        hasHash: Boolean((quote as any)?.hash),
        quoteType: (quote as any)?.quoteType || (quote as any)?.type,
      },
    };
  } catch (error: any) {
    return {
      name: 'SDK Fusion Quote',
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🧪 Biconomy API Approach Comparison Test');
  console.log('=' .repeat(60));
  console.log(`API Key: ${API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`Test User: ${TEST_USER_ADDRESS}`);
  console.log(`Test Private Key: ${TEST_PRIVATE_KEY ? '✅ Set' : '❌ Missing (SDK tests will be skipped)'}`);

  const results: TestResult[] = [];

  // REST API Tests
  console.log('\n' + '='.repeat(60));
  console.log('📡 REST API TESTS');
  console.log('='.repeat(60));
  
  results.push(await testRestComposeEndpoint());
  results.push(await testRestQuoteEndpoint());

  // SDK Tests (only if private key is available)
  if (TEST_PRIVATE_KEY) {
    console.log('\n' + '='.repeat(60));
    console.log('🔧 SDK TESTS');
    console.log('='.repeat(60));
    
    results.push(await testSdkOrchestrator());
    results.push(await testSdkMeeClient());
    results.push(await testSdkBuildComposable());
    results.push(await testSdkFusionQuote());
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);

  console.log('\n📋 Detailed Results:');
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`\n${index + 1}. ${icon} ${result.name}`);
    if (result.endpoint) {
      console.log(`   Endpoint: ${result.method} ${result.endpoint}`);
    }
    if (result.success && result.data) {
      console.log(`   Data:`, JSON.stringify(result.data, null, 2));
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(60));

  const restComposeWorks = results.find(r => r.name === 'REST Compose Endpoint')?.success;
  const sdkWorks = results.find(r => r.name === 'SDK Orchestrator Creation')?.success;

  if (!restComposeWorks && sdkWorks) {
    console.log('\n⚠️  REST API compose endpoint is not working.');
    console.log('✅ SDK approach is working.');
    console.log('\n📝 Recommendation: Migrate to SDK approach using:');
    console.log('   - toMultichainNexusAccount');
    console.log('   - createMeeClient');
    console.log('   - orchestrator.buildComposable');
    console.log('   - meeClient.getFusionQuote');
  } else if (restComposeWorks && !sdkWorks) {
    console.log('\n✅ REST API compose endpoint is working.');
    console.log('❌ SDK approach has issues.');
    console.log('\n📝 Recommendation: Continue using REST API, but monitor for deprecation.');
  } else if (restComposeWorks && sdkWorks) {
    console.log('\n✅ Both approaches are working!');
    console.log('\n📝 Recommendation: Consider migrating to SDK for better type safety and features.');
  } else {
    console.log('\n❌ Both approaches have issues.');
    console.log('\n📝 Recommendation: Check API key, network connectivity, and Biconomy status.');
  }

  console.log('\n' + '='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { runAllTests, testRestComposeEndpoint, testSdkOrchestrator };

