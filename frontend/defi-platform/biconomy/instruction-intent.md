# Intent

> /instructions/intent

This instruction type enables advanced portfolio operations with multiple input and output positions. Define what you want (target tokens with weights), and the system automatically handles routing, bridging, and conversions.

## How It Works

The intent flow:

1. **Accepts input positions** - Multiple source tokens with amounts
2. **Defines target positions** - Desired output tokens with weights (must sum to 1.0)
3. **Automatic routing** - Finds optimal paths for rebalancing
4. **Handles everything** - Swaps, bridges, and multi-step conversions

## Parameters

When using `/instructions/intent` in your `composeFlows` array:

| Parameter         | Type   | Required | Description                                         |
| ----------------- | ------ | -------- | --------------------------------------------------- |
| `slippage`        | number | Yes      | Slippage tolerance (0-1, e.g., 0.01 = 1%)           |
| `inputPositions`  | array  | Yes      | Source tokens with amounts (≥1)                     |
| `targetPositions` | array  | Yes      | Target tokens with weights (≥1, weights sum to 1.0) |

### Input Position Structure

```typescript  theme={null}
{
  chainToken: {
    chainId: number,
    tokenAddress: string
  },
  amount: string // in wei
}
```

### Target Position Structure

```typescript  theme={null}
{
  chainToken: {
    chainId: number,
    tokenAddress: string
  },
  weight: number // 0-1, all weights must sum to 1.0
}
```

## Complete Workflow Examples

<Tabs>
  <Tab title="Portfolio Rebalancing">
    **Split USDC into multiple tokens**

    ```typescript  theme={null}
    import { createWalletClient, http, parseUnits } from 'viem';
    import { privateKeyToAccount } from 'viem/accounts';
    import { base } from 'viem/chains';

    const account = privateKeyToAccount('0x...');
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http()
    });

    // Step 1: Build quote request
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/intent',
          data: {
            slippage: 0.01,
            inputPositions: [{
              chainToken: {
                chainId: 8453, // Base
                tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // USDC
              },
              amount: parseUnits('1000', 6).toString() // 1000 USDC
            }],
            targetPositions: [
              {
                chainToken: {
                  chainId: 8453, // Base
                  tokenAddress: '0x4200000000000000000000000000000000000006' // WETH
                },
                weight: 0.6 // 60% to WETH
              },
              {
                chainToken: {
                  chainId: 10, // Optimism
                  tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58' // USDT
                },
                weight: 0.4 // 40% to USDT
              }
            ]
          }
        }
      ]
    };

    // Step 2: Get quote
    const quote = await fetch('https://api.biconomy.io/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteRequest)
    }).then(r => r.json());

    console.log('Quote type:', quote.quoteType); // 'simple' for smart-account
    console.log('Returned data:', quote.returnedData); // Details for each position

    // Then sign and POST to /v1/execute
    ```
  </Tab>

  <Tab title="Multi-Input Rebalancing">
    **Combine multiple tokens into one**

    ```typescript  theme={null}
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/intent',
          data: {
            slippage: 0.01,
            inputPositions: [
              {
                chainToken: {
                  chainId: 8453,
                  tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // USDC
                },
                amount: parseUnits('500', 6).toString()
              },
              {
                chainToken: {
                  chainId: 10,
                  tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58' // USDT
                },
                amount: parseUnits('500', 6).toString()
              }
            ],
            targetPositions: [{
              chainToken: {
                chainId: 8453,
                tokenAddress: '0x4200000000000000000000000000000000000006' // WETH
              },
              weight: 1.0 // 100% to WETH
            }]
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>

  <Tab title="Complex Multi-Chain">
    **Rebalance across multiple chains**

    ```typescript  theme={null}
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/intent',
          data: {
            slippage: 0.01,
            inputPositions: [{
              chainToken: {
                chainId: 8453,
                tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
              },
              amount: parseUnits('2000', 6).toString()
            }],
            targetPositions: [
              {
                chainToken: {
                  chainId: 8453,
                  tokenAddress: '0x4200000000000000000000000000000000000006'
                },
                weight: 0.4 // 40% WETH on Base
              },
              {
                chainToken: {
                  chainId: 10,
                  tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58'
                },
                weight: 0.3 // 30% USDT on Optimism
              },
              {
                chainToken: {
                  chainId: 42161,
                  tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
                },
                weight: 0.3 // 30% USDC on Arbitrum
              }
            ]
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>
</Tabs>

## Returned Data Structure

The quote response includes details for each target position:

```json  theme={null}
{
  "ownerAddress": "0x...",
  "mode": "smart-account",
  "fee": {...},
  "quoteType": "simple",
  "quote": {...},
  "payloadToSign": [...],
  "returnedData": [
    {
      "outputAmount": "599850000",
      "minOutputAmount": "593850000",
      "targetPosition": {
        "chainToken": {
          "chainId": 8453,
          "tokenAddress": "0x4200000000000000000000000000000000000006"
        },
        "weight": 0.6
      },
      "route": {
        "summary": "lifi[uniswapv3]",
        "steps": [...]
      }
    },
    {
      "outputAmount": "399900000",
      "minOutputAmount": "395900000",
      "targetPosition": {
        "chainToken": {
          "chainId": 10,
          "tokenAddress": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"
        },
        "weight": 0.4
      },
      "route": {
        "summary": "lifi[uniswapv3] => across[SpokePoolV3]",
        "steps": [...]
      }
    }
  ]
}
```

## Intent vs Direct Instructions

The Supertransaction API offers two approaches:

| Approach                                    | Use Case                                             | Control Level               |
| ------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| Intent-based (this endpoint)                | Express desired outcome, system determines execution | High-level abstraction      |
| Direct instructions (`/instructions/build`) | Explicitly specify each step                         | Full control over execution |

The intent approach simplifies complex multi-chain operations by automatically:

* Finding optimal routes
* Handling protocol interactions
* Managing cross-chain complexity
* Optimizing for gas efficiency

## Best Practices

<AccordionGroup>
  <Accordion title="Ensure Weights Sum to 1.0">
    All target position weights must sum to exactly 1.0:

    ```typescript  theme={null}
    // ✅ Valid
    targetPositions: [
      { chainToken: {...}, weight: 0.6 },
      { chainToken: {...}, weight: 0.4 }
    ] // Sum = 1.0

    // ❌ Invalid
    targetPositions: [
      { chainToken: {...}, weight: 0.5 },
      { chainToken: {...}, weight: 0.6 }
    ] // Sum = 1.1
    ```
  </Accordion>

  <Accordion title="Consider Slippage for Multi-Position Operations">
    Use higher slippage for complex rebalancing:

    ```typescript  theme={null}
    // Simple rebalancing: 1%
    slippage: 0.01

    // Complex multi-chain rebalancing: 2%
    slippage: 0.02

    // Many positions with cross-chain: 3%
    slippage: 0.03
    ```
  </Accordion>

  <Accordion title="Validate Output Amounts">
    Check each position's output in returnedData:

    ```typescript  theme={null}
    quote.returnedData.forEach((positionResult, index) => {
      const outputUi = formatUnits(BigInt(positionResult.outputAmount), 6);
      const minOutputUi = formatUnits(BigInt(positionResult.minOutputAmount), 6);

      console.log(`Position ${index + 1}:`);
      console.log(`  Expected: ${outputUi}`);
      console.log(`  Minimum: ${minOutputUi}`);
      console.log(`  Route: ${positionResult.route.summary}`);
    });
    ```
  </Accordion>

  <Accordion title="Use for Portfolio Management">
    Intent is perfect for:

    * Rebalancing portfolios to target allocations
    * Converting multiple small positions into fewer tokens
    * Distributing one token across multiple chains
    * DCA (dollar-cost averaging) strategies
  </Accordion>
</AccordionGroup>

## Troubleshooting

<AccordionGroup>
  <Accordion title="Weights don't sum to 1.0">
    Ensure all weights add up to exactly 1.0:

    ```typescript  theme={null}
    const weights = targetPositions.map(p => p.weight);
    const sum = weights.reduce((a, b) => a + b, 0);

    if (Math.abs(sum - 1.0) > 0.0001) {
      throw new Error(`Weights sum to ${sum}, must be 1.0`);
    }
    ```
  </Accordion>

  <Accordion title="No route found for some positions">
    If routing fails:

    * Check token liquidity on source and target chains
    * Verify token addresses are correct
    * Try adjusting weights to reduce complexity
    * Increase slippage tolerance
  </Accordion>

  <Accordion title="Output amounts lower than expected">
    If outputs are too low:

    * Review each position's route in `returnedData`
    * Check if bridge fees are higher than expected
    * Consider splitting into separate operations
    * Verify market prices are as expected
  </Accordion>
</AccordionGroup>


# Simple Intent

> /instructions/intent-simple

This instruction type enables straightforward token swaps (same-chain or cross-chain). You specify source and destination tokens, and the system automatically finds the optimal route through bridge aggregators and swap providers.

## How It Works

The intent-simple flow:

1. **Analyzes swap parameters** - Source/destination tokens and chains
2. **Finds optimal route** - Leverages LiFi, GlueX, Across, and other providers
3. **Handles complexity** - Manages bridging, swapping, and multi-step routes
4. **Returns route details** - Provides expected output and routing information

## Parameters

When using `/instructions/intent-simple` in your `composeFlows` array:

| Parameter              | Type   | Required | Description                               |
| ---------------------- | ------ | -------- | ----------------------------------------- |
| `srcToken`             | string | Yes      | Source token address (checksummed)        |
| `dstToken`             | string | Yes      | Destination token address (checksummed)   |
| `srcChainId`           | number | Yes      | Source chain ID                           |
| `dstChainId`           | number | Yes      | Destination chain ID                      |
| `amount`               | string | Yes      | Amount to swap (in wei/smallest unit)     |
| `slippage`             | number | Yes      | Slippage tolerance (0-1, e.g., 0.01 = 1%) |
| `allowSwapProviders`   | string | No       | Comma-separated allowed swap providers    |
| `denySwapProviders`    | string | No       | Comma-separated denied swap providers     |
| `allowBridgeProviders` | string | No       | Comma-separated allowed bridge providers  |
| `denyBridgeProviders`  | string | No       | Comma-separated denied bridge providers   |

## Complete Workflow Examples

<Tabs>
  <Tab title="EOA Mode">
    **Cross-chain swap with withdrawal**

    ```typescript  theme={null}
    import { createWalletClient, http, parseUnits } from 'viem';
    import { privateKeyToAccount } from 'viem/accounts';
    import { base } from 'viem/chains';

    const account = privateKeyToAccount('0x...');
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http()
    });

    // Step 1: Build quote request with intent-simple in composeFlows
    const quoteRequest = {
      mode: 'eoa',
      ownerAddress: account.address,
      fundingTokens: [{
        tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
        chainId: 8453,
        amount: parseUnits('100', 6).toString()
      }],
      feeToken: {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        chainId: 8453
      },
      composeFlows: [
        // Cross-chain swap: USDC (Base) → USDT (OP)
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 10,
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            dstToken: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
            amount: parseUnits('100', 6).toString(),
            slippage: 0.01,
            denySwapProviders: 'gluex' // Optional: exclude providers
          }
        },
        // Withdraw USDT to EOA (critical for EOA mode)
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function transfer(address to, uint256 value)',
            args: [
              account.address,
              {
                type: 'runtimeErc20Balance',
                tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
                constraints: { gte: '1' }
              }
            ],
            to: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
            chainId: 10
          }
        }
      ]
    };

    // Step 2: Get quote
    const quote = await fetch('https://api.biconomy.io/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteRequest)
    }).then(r => r.json());

    console.log('Quote type:', quote.quoteType); // 'permit' for USDC
    console.log('Fee:', quote.fee.amount);

    // Check swap details from returnedData
    const swapResult = quote.returnedData[0];
    console.log('Expected output:', swapResult.outputAmount);
    console.log('Min output:', swapResult.minOutputAmount);
    console.log('Route:', swapResult.route.summary);

    // Then sign and POST to /v1/execute
    ```
  </Tab>

  <Tab title="Smart Account">
    **Gasless cross-chain swap**

    ```typescript  theme={null}
    import { createWalletClient, http, parseUnits } from 'viem';
    import { privateKeyToAccount } from 'viem/accounts';
    import { base } from 'viem/chains';

    const account = privateKeyToAccount('0x...');
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http()
    });

    // Step 1: Build quote request (no fundingTokens, no feeToken = gasless)
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      // No fundingTokens - using existing Nexus balance
      // No feeToken - using sponsorship (gasless)
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 10,
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            dstToken: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
            amount: parseUnits('50', 6).toString(),
            slippage: 0.01
          }
        }
      ]
    };

    // Step 2: Get quote
    const quote = await fetch('https://api.biconomy.io/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteRequest)
    }).then(r => r.json());

    console.log('Quote type:', quote.quoteType); // Always 'simple' for smart-account
    console.log('Expected output:', quote.returnedData[0].outputAmount);

    // Then sign and POST to /v1/execute
    ```
  </Tab>

  <Tab title="Same-Chain Swap">
    **Swap on a single chain**

    ```typescript  theme={null}
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 8453, // Same chain
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
            dstToken: '0x4200000000000000000000000000000000000006', // WETH
            amount: parseUnits('100', 6).toString(),
            slippage: 0.01
          }
        }
      ]
    };

    // Then quote → sign → execute as usual
    ```
  </Tab>
</Tabs>

## Returned Data Structure

When you use `intent-simple` in your quote request, the response includes `returnedData` with swap details:

```json  theme={null}
{
  "ownerAddress": "0x...",
  "mode": "eoa",
  "fee": {...},
  "quoteType": "permit",
  "quote": {...},
  "payloadToSign": [...],
  "returnedData": [
    {
      "outputAmount": "99950000",
      "minOutputAmount": "98950000",
      "route": {
        "summary": "lifi[uniswapv3] => across[SpokePoolV3]",
        "steps": [
          {
            "type": "swap",
            "protocol": "lifi",
            "sources": ["uniswapv3"],
            "srcToken": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            "dstToken": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
            "srcChainId": 8453,
            "dstChainId": 10,
            "inputAmount": "100000000",
            "outputAmount": "99950000",
            "minOutputAmount": "98950000"
          }
        ],
        "type": "DIRECT",
        "totalGasFeesUsd": 0.05,
        "totalBridgeFeesUsd": 0.02,
        "estimatedTime": 180
      }
    }
  ]
}
```

### Route Data Fields

| Field                      | Type   | Description                                    |
| -------------------------- | ------ | ---------------------------------------------- |
| `outputAmount`             | string | Expected output amount (in wei)                |
| `minOutputAmount`          | string | Minimum output after slippage (in wei)         |
| `route.summary`            | string | Human-readable route description               |
| `route.steps`              | array  | Detailed steps with protocol info              |
| `route.type`               | string | Route strategy (e.g., "DIRECT", "PIVOT\_USDT") |
| `route.totalGasFeesUsd`    | number | Estimated gas fees in USD                      |
| `route.totalBridgeFeesUsd` | number | Estimated bridge fees in USD                   |
| `route.estimatedTime`      | number | Estimated time in seconds                      |

Each step contains:

| Field                         | Description                            |
| ----------------------------- | -------------------------------------- |
| `type`                        | "swap" or "bridge"                     |
| `protocol`                    | Provider used (e.g., "lifi", "across") |
| `sources`                     | DEXes used (e.g., \["uniswapv3"])      |
| `srcToken`, `dstToken`        | Token addresses                        |
| `srcChainId`, `dstChainId`    | Chain IDs                              |
| `inputAmount`, `outputAmount` | Amounts for this step                  |

## Provider Control

Control which providers are used for routing:

```typescript  theme={null}
{
  type: '/instructions/intent-simple',
  data: {
    // ... other params
    allowSwapProviders: 'lifi,gluex',        // Only use these for swaps
    denySwapProviders: 'gluex',              // Exclude these from swaps
    allowBridgeProviders: 'across',          // Only use these for bridging
    denyBridgeProviders: 'some-bridge'       // Exclude these from bridging
  }
}
```

**Available Providers:**

* **Swap**: LiFi, GlueX, and others
* **Bridge**: Across, and others

## Best Practices

<AccordionGroup>
  <Accordion title="Always Add Withdrawal for EOA Mode">
    When using EOA mode, funds remain in Nexus after operations. Always add a withdrawal instruction:

    ```typescript  theme={null}
    {
      type: '/instructions/build',
      data: {
        functionSignature: 'function transfer(address to, uint256 value)',
        args: [
          ownerAddress,
          {
            type: 'runtimeErc20Balance',
            tokenAddress: dstToken,
            constraints: { gte: '1' }
          }
        ],
        to: dstToken,
        chainId: dstChainId
      }
    }
    ```
  </Accordion>

  <Accordion title="Validate Swap Output">
    Always check the `minOutputAmount` to ensure acceptable slippage:

    ```typescript  theme={null}
    const swapResult = quote.returnedData[0];
    const outputUi = formatUnits(BigInt(swapResult.outputAmount), 6);
    const minOutputUi = formatUnits(BigInt(swapResult.minOutputAmount), 6);

    console.log(`Expected: ${outputUi} USDT (min: ${minOutputUi})`);

    if (Number(minOutputUi) < acceptableMinimum) {
      throw new Error('Output too low after slippage');
    }
    ```
  </Accordion>

  <Accordion title="Use Appropriate Slippage">
    Set slippage based on market conditions and token liquidity:

    ```typescript  theme={null}
    // Stablecoin swaps: low slippage
    slippage: 0.001  // 0.1%

    // Volatile token swaps: higher slippage
    slippage: 0.03   // 3%

    // Cross-chain: moderate slippage
    slippage: 0.01   // 1%
    ```
  </Accordion>

  <Accordion title="Review Route Before Execution">
    Check the route summary for unexpected routing:

    ```typescript  theme={null}
    const route = quote.returnedData[0].route;
    console.log('Route:', route.summary);
    console.log('Gas fees:', route.totalGasFeesUsd);
    console.log('Bridge fees:', route.totalBridgeFeesUsd);
    console.log('Estimated time:', route.estimatedTime, 'seconds');
    ```
  </Accordion>
</AccordionGroup>

## Troubleshooting

<AccordionGroup>
  <Accordion title="No route found">
    If no route is available:

    * Check token addresses are correct and checksummed
    * Verify both tokens are supported on their respective chains
    * Try adjusting provider allow/deny lists
    * Increase slippage tolerance if needed
  </Accordion>

  <Accordion title="Output amount too low">
    If `minOutputAmount` is lower than expected:

    * Check current market prices and liquidity
    * Review the `route.steps` to see where value is lost
    * Consider splitting large swaps into smaller ones
    * Try different providers using allow/deny parameters
  </Accordion>

  <Accordion title="Swap failed during execution">
    If execution fails:

    * Check sufficient balance in source location (EOA or Nexus)
    * Verify slippage wasn't exceeded during execution
    * Review transaction on MEE Explorer for specific error
  </Accordion>
</AccordionGroup>
