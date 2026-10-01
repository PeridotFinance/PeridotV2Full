# Build

> /instructions/build

This instruction type enables direct contract interaction by specifying exact function calls. Provide ABI signatures and arguments to call any EVM contract as part of your supertransaction.

## How It Works

The build flow:

1. **Accepts function signatures** - ABI-formatted function definitions
2. **Processes arguments** - Supports static values and runtime balance injection
3. **Generates instructions** - Creates executable MEE instructions
4. **Enables composition** - Combines with other flow types seamlessly

## Parameters

When using `/instructions/build` in your `composeFlows` array:

| Parameter           | Type   | Required | Description                                                                    |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `functionSignature` | string | Yes      | ABI function signature (e.g., `function transfer(address to, uint256 amount)`) |
| `args`              | array  | Yes      | Function arguments array                                                       |
| `to`                | string | Yes      | Target contract address (checksummed)                                          |
| `chainId`           | number | Yes      | Chain ID for execution                                                         |
| `value`             | string | No       | Native token value in wei (default: "0")                                       |
| `gasLimit`          | string | No       | Gas limit override                                                             |

## Runtime Balance Injection

The `build` flow type supports `runtimeErc20Balance` for dynamic amount calculations:

```typescript  theme={null}
{
  type: 'runtimeErc20Balance',
  tokenAddress: '0x...',
  constraints: { gte: '1' }  // Optional: minimum balance required
}
```

<Note>
  **Runtime balance** is currently only supported for `/instructions/build` flow type. Support for other types coming in future updates.
</Note>

## Complete Workflow Examples

<Tabs>
  <Tab title="Token Transfer">
    **Simple ERC20 transfer**

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
          type: '/instructions/build',
          data: {
            functionSignature: 'function transfer(address to, uint256 value)',
            args: [
              '0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a', // recipient
              parseUnits('10', 6).toString() // 10 USDC
            ],
            to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
            chainId: 8453
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

    // Then sign and POST to /v1/execute
    ```
  </Tab>

  <Tab title="With Runtime Balance">
    **Transfer entire balance dynamically**

    ```typescript  theme={null}
    const quoteRequest = {
      mode: 'eoa',
      ownerAddress: account.address,
      fundingTokens: [{
        tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        chainId: 8453,
        amount: parseUnits('100', 6).toString()
      }],
      composeFlows: [
        // Swap first
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 10,
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            dstToken: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
            amount: parseUnits('100', 6).toString(),
            slippage: 0.01
          }
        },
        // Transfer resulting balance
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function transfer(address to, uint256 value)',
            args: [
              account.address,
              {
                type: 'runtimeErc20Balance',
                tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
                constraints: { gte: '1' } // Ensure at least 1 wei
              }
            ],
            to: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
            chainId: 10
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>

  <Tab title="DeFi Operations">
    **Approve and supply to Aave**

    ```typescript  theme={null}
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        // Step 1: Swap USDC → WETH
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 8453,
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            dstToken: '0x4200000000000000000000000000000000000006',
            amount: parseUnits('100', 6).toString(),
            slippage: 0.01
          }
        },
        // Step 2: Approve Aave pool
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function approve(address spender, uint256 amount)',
            args: [
              '0x...aavePoolAddress',
              {
                type: 'runtimeErc20Balance',
                tokenAddress: '0x4200000000000000000000000000000000000006'
              }
            ],
            to: '0x4200000000000000000000000000000000000006',
            chainId: 8453,
            gasLimit: '80000'
          }
        },
        // Step 3: Supply to Aave
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
            args: [
              '0x4200000000000000000000000000000000000006',
              {
                type: 'runtimeErc20Balance',
                tokenAddress: '0x4200000000000000000000000000000000000006'
              },
              account.address, // Or Nexus address
              0
            ],
            to: '0x...aavePoolAddress',
            chainId: 8453,
            gasLimit: '350000'
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>

  <Tab title="Native ETH Withdrawal">
    **Withdraw native ETH using ETH Forwarder**

    <Note>
      **Important**: When withdrawing native ETH/tokens (not ERC20), you **cannot** use the standard ERC20 `transfer()` function. Use the ETH Forwarder contract instead.
    </Note>

    ```typescript  theme={null}
    import { parseUnits, zeroAddress } from 'viem';

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
        // Step 1: Swap USDC → Native ETH
        {
          type: '/instructions/intent-simple',
          data: {
            srcChainId: 8453,
            dstChainId: 8453,
            srcToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
            dstToken: zeroAddress, // Native ETH (0x0000...0000)
            amount: parseUnits('100', 6).toString(),
            slippage: 0.01
          }
        },
        // Step 2: Withdraw native ETH to EOA using ETH Forwarder
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function forward(address recipient)',
            args: [
              account.address  // Recipient (your EOA)
            ],
            to: '0x000000Afe527A978Ecb761008Af475cfF04132a1',  // ETH Forwarder contract
            chainId: 8453,
            value: parseUnits('0.035', 18).toString(),  // Amount in wei to forward (~$100 worth)
            gasLimit: '300000'
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```

    **Key Points**:

    * Native tokens are represented using `zeroAddress` (`0x0000000000000000000000000000000000000000`)
    * ETH Forwarder contract: `0x000000Afe527A978Ecb761008Af475cfF04132a1`
    * Use the `value` field to specify the amount of native tokens to forward
    * Works for ETH, MATIC, BNB, and all other native tokens
    * Same forwarder address across all supported chains
  </Tab>
</Tabs>

## Argument Types

The `args` array supports various data types:

### Static Values

```typescript  theme={null}
args: [
  '0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a',  // address
  '1000000',                                         // uint256 as string
  true,                                              // boolean
  ['0x...', '0x...']                                // address[] array
]
```

### Runtime Balance (Dynamic)

```typescript  theme={null}
args: [
  recipient,
  {
    type: 'runtimeErc20Balance',
    tokenAddress: '0x...',
    constraints: { gte: '1' } // Optional minimum
  }
]
```

### Complex Types

```typescript  theme={null}
// Struct arguments
args: [
  {
    token: '0x...',
    amount: '1000000',
    recipient: '0x...'
  }
]

// Nested arrays
args: [
  [
    ['0x...', '100'],
    ['0x...', '200']
  ]
]
```

## Best Practices

<AccordionGroup>
  <Accordion title="Use Runtime Balance for Withdrawals">
    Always use runtime balance when withdrawing after swaps (for EOA mode):

    ```typescript  theme={null}
    {
      type: '/instructions/build',
      data: {
        functionSignature: 'function transfer(address to, uint256 value)',
        args: [
          ownerAddress,
          {
            type: 'runtimeErc20Balance',
            tokenAddress: resultToken,
            constraints: { gte: '1' }
          }
        ],
        to: resultToken,
        chainId: dstChainId
      }
    }
    ```
  </Accordion>

  <Accordion title="Set Appropriate Gas Limits">
    Override gas limits for complex operations:

    ```typescript  theme={null}
    // Simple transfer
    gasLimit: '50000'

    // DeFi protocol interactions
    gasLimit: '350000'

    // Complex multi-step operations
    gasLimit: '500000'
    ```
  </Accordion>

  <Accordion title="Batch Same-Chain Operations">
    Same-chain `build` instructions are automatically batched:

    ```typescript  theme={null}
    composeFlows: [
      {
        type: '/instructions/build',
        // batch: true (default)
        data: { chainId: 8453, ... }
      },
      {
        type: '/instructions/build',
        // Automatically batched with above
        data: { chainId: 8453, ... }
      }
    ]
    ```
  </Accordion>

  <Accordion title="Validate Function Signatures">
    Ensure function signatures match the ABI exactly:

    ```typescript  theme={null}
    // ✅ Correct
    functionSignature: 'function transfer(address to, uint256 value)'

    // ❌ Wrong (missing 'function' keyword)
    functionSignature: 'transfer(address to, uint256 value)'

    // ❌ Wrong (incorrect parameter names - doesn't matter but be consistent)
    functionSignature: 'function transfer(address recipient, uint256 amt)'
    ```
  </Accordion>

  <Accordion title="Use ETH Forwarder for Native Tokens">
    When withdrawing or transferring native tokens (ETH, MATIC, BNB, etc.), always use the ETH Forwarder contract:

    ```typescript  theme={null}
    import { zeroAddress } from 'viem';

    // ❌ Bad - Cannot use ERC20 transfer for native tokens
    {
      type: '/instructions/build',
      data: {
        functionSignature: 'function transfer(address to, uint256 value)',
        args: [ownerAddress, parseUnits('0.1', 18).toString()],
        to: zeroAddress,  // Native ETH - transfer() won't work
        chainId: 8453
      }
    }

    // ✅ Good - Use ETH forwarder for native tokens
    {
      type: '/instructions/build',
      data: {
        functionSignature: 'function forward(address recipient)',
        args: [ownerAddress],
        to: '0x000000Afe527A978Ecb761008Af475cfF04132a1',  // ETH forwarder
        chainId: 8453,
        value: parseUnits('0.1', 18).toString(),  // Amount to forward
        gasLimit: '300000'
      }
    }
    ```
  </Accordion>
</AccordionGroup>

## Common Use Cases

### Withdraw from DeFi Protocol

```typescript  theme={null}
{
  type: '/instructions/build',
  data: {
    functionSignature: 'function withdraw(address asset, uint256 amount, address to)',
    args: [
      '0x...tokenAddress',
      parseUnits('100', 18).toString(),
      account.address
    ],
    to: '0x...aavePoolAddress',
    chainId: 8453,
    gasLimit: '300000'
  }
}
```

### NFT Transfer

```typescript  theme={null}
{
  type: '/instructions/build',
  data: {
    functionSignature: 'function safeTransferFrom(address from, address to, uint256 tokenId)',
    args: [
      account.address,
      '0x...recipientAddress',
      '42' // NFT token ID
    ],
    to: '0x...nftContractAddress',
    chainId: 8453
  }
}
```

### Custom DEX Swap

```typescript  theme={null}
{
  type: '/instructions/build',
  data: {
    functionSignature: 'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    args: [
      parseUnits('100', 6).toString(),
      parseUnits('95', 6).toString(),
      ['0x...tokenA', '0x...tokenB'],
      account.address,
      Math.floor(Date.now() / 1000) + 3600 // 1 hour deadline
    ],
    to: '0x...routerAddress',
    chainId: 8453,
    gasLimit: '200000'
  }
}
```

## Troubleshooting

<AccordionGroup>
  <Accordion title="Invalid function signature">
    Ensure your signature exactly matches the contract ABI:

    * Include the `function` keyword
    * Use correct parameter types (e.g., `uint256`, not `uint`)
    * Match parameter names (though names don't affect encoding)
  </Accordion>

  <Accordion title="Transaction reverted">
    Common causes:

    * Insufficient balance for operation
    * Missing token approvals (add approve instruction first)
    * Gas limit too low (increase `gasLimit`)
    * Contract-specific requirements not met
  </Accordion>

  <Accordion title="Runtime balance not working">
    Runtime balance is only supported for `/instructions/build`:

    * Cannot use in `/instructions/intent-simple`
    * Cannot use in `/instructions/intent`
    * Must be in the `args` array, not other parameters
  </Accordion>
</AccordionGroup>


# BuildRaw

> /instructions/build-raw

This instruction type enables contract interactions using pre-encoded calldata. Provide raw hex-encoded function calls for maximum control over the exact calldata being executed.

## How It Works

The build-raw flow:

1. **Accepts pre-encoded calldata** - Raw hex strings representing complete function calls
2. **Validates calldata format** - Ensures proper hex encoding
3. **Generates instructions** - Creates executable MEE instructions
4. **Enables composition** - Combines with other flow types seamlessly

## When to Use BuildRaw

<CardGroup cols={2}>
  <Card title="✅ Use BuildRaw When">
    * You have pre-generated calldata from another system
    * You need exact control over the calldata format
    * You're migrating from a system that already encodes calldata
    * You want to avoid ABI parsing overhead client-side
  </Card>

  <Card title="❌ Use /instructions/build Instead">
    * You need runtime balance injection
    * You want the API to handle encoding
    * You prefer working with function signatures
    * You want more readable code
  </Card>
</CardGroup>

## Key Differences from Build

| Feature         | `/instructions/build`     | `/instructions/build-raw` |
| --------------- | ------------------------- | ------------------------- |
| Input           | Function signature + args | Pre-encoded calldata      |
| Runtime Balance | ✅ Supported               | ❌ **NOT Supported**       |
| Client Encoding | API encodes               | Client encodes            |
| Use Case        | Most common operations    | Advanced/custom calldata  |

<Warning>
  **Critical Limitation**: BuildRaw does **NOT** support runtime balance injection. The calldata must be fully encoded client-side with concrete values. If you need runtime balance (e.g., transferring all remaining tokens), use `/instructions/build` instead.
</Warning>

## Parameters

When using `/instructions/build-raw` in your `composeFlows` array:

| Parameter  | Type   | Required | Description                                                |
| ---------- | ------ | -------- | ---------------------------------------------------------- |
| `data`     | string | Yes      | Pre-encoded calldata as hex string (e.g., "0xa9059cbb...") |
| `to`       | string | Yes      | Target contract address (checksummed)                      |
| `chainId`  | number | Yes      | Chain ID for execution                                     |
| `value`    | string | No       | Native token value in wei (default: "0")                   |
| `gasLimit` | string | No       | Gas limit override                                         |

## Complete Workflow Examples

<Tabs>
  <Tab title="Simple ERC20 Transfer">
    **Transfer tokens using pre-encoded calldata**

    ```typescript  theme={null}
    import { createWalletClient, http, parseUnits, encodeFunctionData, parseAbi } from 'viem';
    import { privateKeyToAccount } from 'viem/accounts';
    import { base } from 'viem/chains';

    const account = privateKeyToAccount('0x...');
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http()
    });

    // Encode the calldata client-side
    const transferAbi = parseAbi(['function transfer(address to, uint256 value)']);
    const transferCalldata = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [
        '0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a',  // Recipient
        parseUnits('100', 6)                              // Amount (must be concrete)
      ],
    });

    // Build quote request using build-raw
    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/build-raw',
          data: {
            to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',  // USDC on Base
            data: transferCalldata,                             // Pre-encoded calldata
            chainId: 8453
          }
        }
      ]
    };

    // Get quote
    const quote = await fetch('https://api.biconomy.io/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteRequest)
    }).then(r => r.json());

    // Then sign and POST to /v1/execute
    ```
  </Tab>

  <Tab title="WETH Deposit with Value">
    **Deposit ETH to WETH contract**

    ```typescript  theme={null}
    import { encodeFunctionData, parseAbi, parseUnits } from 'viem';

    // Encode WETH deposit
    const wethAbi = parseAbi(['function deposit()']);
    const depositCalldata = encodeFunctionData({
      abi: wethAbi,
      functionName: 'deposit',
    });

    const quoteRequest = {
      mode: 'smart-account',
      ownerAddress: account.address,
      composeFlows: [
        {
          type: '/instructions/build-raw',
          data: {
            to: '0x4200000000000000000000000000000000000006',  // WETH on Base
            data: depositCalldata,
            chainId: 8453,
            value: parseUnits('1', 18).toString(),             // Send 1 ETH
            gasLimit: '100000'
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>

  <Tab title="Combining with /build">
    **Use build-raw for static calls, /build for dynamic amounts**

    ```typescript  theme={null}
    import { encodeFunctionData, parseAbi, parseUnits } from 'viem';

    // Encode approve calldata with concrete amount
    const approveAbi = parseAbi(['function approve(address spender, uint256 amount)']);
    const approveCalldata = encodeFunctionData({
      abi: approveAbi,
      functionName: 'approve',
      args: [
        '0x...spenderAddress',
        parseUnits('100', 6)  // Concrete approval amount
      ],
    });

    const quoteRequest = {
      mode: 'eoa',
      ownerAddress: account.address,
      fundingTokens: [{
        tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        chainId: 8453,
        amount: parseUnits('100', 6).toString()
      }],
      composeFlows: [
        // Use build-raw for approval with fixed amount
        {
          type: '/instructions/build-raw',
          data: {
            to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            data: approveCalldata,
            chainId: 8453
          }
        },
        // Use /build for withdrawal with runtime balance
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function transfer(address to, uint256 value)',
            args: [
              account.address,
              {
                type: 'runtimeErc20Balance',
                tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                constraints: { gte: '1' }
              }
            ],
            to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            chainId: 8453
          }
        }
      ]
    };

    // Then quote → sign → execute
    ```
  </Tab>
</Tabs>

## BuildRaw vs Build Decision Guide

```typescript  theme={null}
// ❌ CANNOT use buildRaw for runtime balance
{
  type: '/instructions/build-raw',  // Wrong! Runtime balance not supported
  data: {
    to: tokenAddress,
    data: encodeFunctionData({
      abi: [...],
      functionName: 'transfer',
      args: [recipient, { type: 'runtimeErc20Balance', ... }]  // Error!
    }),
    chainId: 8453
  }
}

// ✅ Use /build for runtime balance
{
  type: '/instructions/build',
  data: {
    functionSignature: 'function transfer(address to, uint256 value)',
    args: [
      recipient,
      {
        type: 'runtimeErc20Balance',
        tokenAddress: tokenAddress,
        constraints: { gte: '1' }
      }
    ],
    to: tokenAddress,
    chainId: 8453
  }
}

// ✅ Use buildRaw when you have concrete calldata
{
  type: '/instructions/build-raw',
  data: {
    to: tokenAddress,
    data: '0xa9059cbb...',  // Pre-encoded transfer calldata
    chainId: 8453
  }
}
```

## Best Practices

<AccordionGroup>
  <Accordion title="Validate Encoded Calldata">
    Always validate your encoded calldata before sending:

    ```typescript  theme={null}
    // ✅ Good - validate calldata format
    if (!calldata.startsWith('0x') || calldata.length < 10) {
      throw new Error('Invalid calldata format');
    }

    // ✅ Good - decode to verify
    import { decodeFunctionData, parseAbi } from 'viem';

    try {
      const decoded = decodeFunctionData({
        abi: transferAbi,
        data: calldata
      });
      console.log('Decoded args:', decoded.args);
    } catch (error) {
      throw new Error('Invalid calldata encoding');
    }
    ```
  </Accordion>

  <Accordion title="Set Appropriate Gas Limits">
    Override gas limits for complex operations:

    ```typescript  theme={null}
    // Simple operations
    gasLimit: '50000'

    // DeFi protocol interactions
    gasLimit: '350000'

    // Complex multi-step operations
    gasLimit: '500000'
    ```
  </Accordion>

  <Accordion title="Know When to Use Build Instead">
    Use `/instructions/build` when you need:

    * Runtime balance injection for dynamic amounts
    * Better code readability with function signatures
    * API-side encoding to reduce client complexity

    Use `/instructions/build-raw` when you need:

    * Pre-encoded calldata from external systems
    * Exact control over calldata format
    * Migration from existing systems with encoded data
  </Accordion>

  <Accordion title="Test with Small Amounts First">
    Always test your encoded calldata with small amounts:

    ```typescript  theme={null}
    // ❌ Bad - testing with large amount
    args: [recipient, parseUnits('10000', 6)]

    // ✅ Good - test with small amount first
    args: [recipient, parseUnits('1', 6)]
    ```
  </Accordion>
</AccordionGroup>

## Common Use Cases

### Pre-generated Transaction Data

```typescript  theme={null}
// When you already have encoded calldata from another source
const existingCalldata = '0xa9059cbb000000000000000000000000742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a0000000000000000000000000000000000000000000000000000000000989680';

{
  type: '/instructions/build-raw',
  data: {
    to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    data: existingCalldata,
    chainId: 8453
  }
}
```

### Multicall Operations

```typescript  theme={null}
import { encodeFunctionData, parseAbi } from 'viem';

// Encode multicall
const multicallAbi = parseAbi(['function multicall(bytes[] calldata data) returns (bytes[] memory)']);
const multicallData = encodeFunctionData({
  abi: multicallAbi,
  functionName: 'multicall',
  args: [[
    '0x...', // First call
    '0x...', // Second call
    '0x...'  // Third call
  ]]
});

{
  type: '/instructions/build-raw',
  data: {
    to: '0x...multicallContract',
    data: multicallData,
    chainId: 8453,
    gasLimit: '500000'
  }
}
```

## Troubleshooting

<AccordionGroup>
  <Accordion title="Invalid calldata format">
    Ensure your calldata:

    * Starts with `0x`
    * Is a valid hex string
    * Has even length (excluding `0x`)
    * Matches the expected function selector
  </Accordion>

  <Accordion title="Transaction reverted">
    Common causes:

    * Incorrect calldata encoding
    * Wrong function parameters or order
    * Insufficient balance for operation
    * Missing approvals for token operations
    * Gas limit too low
  </Accordion>

  <Accordion title="Cannot use runtime balance">
    BuildRaw does NOT support runtime balance injection. If you need dynamic amounts:

    ```typescript  theme={null}
    // ❌ Won't work with build-raw
    {
      type: 'runtimeErc20Balance',
      tokenAddress: '0x...'
    }

    // ✅ Use /instructions/build instead
    {
      type: '/instructions/build',
      data: {
        functionSignature: 'function transfer(address to, uint256 value)',
        args: [recipient, { type: 'runtimeErc20Balance', ... }],
        to: tokenAddress,
        chainId: 8453
      }
    }
    ```
  </Accordion>

  <Accordion title="Calldata encoding mismatch">
    Verify your encoding matches the contract ABI:

    ```typescript  theme={null}
    // Decode your calldata to verify
    import { decodeFunctionData } from 'viem';

    const decoded = decodeFunctionData({
      abi: yourAbi,
      data: yourCalldata
    });

    console.log('Function name:', decoded.functionName);
    console.log('Arguments:', decoded.args);
    ```
  </Accordion>
</AccordionGroup>

## Related Documentation

<CardGroup cols={2}>
  <Card title="/instructions/build" icon="hammer" href="/supertransaction-api/endpoints/build">
    Use when you need runtime balance or prefer function signatures
  </Card>

  <Card title="/instructions/intent-simple" icon="shuffle" href="/supertransaction-api/endpoints/intent-simple">
    For simple swaps and bridges with automatic routing
  </Card>
</CardGroup>
