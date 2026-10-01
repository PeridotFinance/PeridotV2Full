# Workflows Library

Build complex DeFi strategies using the Supertransaction API's intent-based infrastructure for multi-chain execution.

The Supertransaction system provides powerful REST APIs for orchestrating DeFi workflows across multiple chains with a single signature:

* **Intent-Based Swaps**: Token transformations with automatic route optimization
* **Portfolio Rebalancing**: Multi-asset allocation management
* **Composable Actions**: Chain multiple operations in sequence
* **Custom Operations**: Direct contract calls when needed

<Tip>
  **Intent-First Approach** <br />
  Express DeFi operations as token transformations (input → output) and let the solver network find optimal execution paths. Only use custom calls for operations that can't be expressed as intents.
</Tip>

## Workflow Process

All operations use the unified quote → sign → execute flow:

1. Create quote with embedded `composeFlows` using `/v1/quote`
2. Sign the returned payloads
3. Execute with `/v1/execute`

## 1. Token Operations with Intents

Use intent-based compose flows for all token transformations, including DeFi deposits and withdrawals.

### Simple Token Swap

**Example**: Swap 1 ETH to USDC

<CodeGroup>
  ```typescript TypeScript theme={null}
  const ETH = '0x0000000000000000000000000000000000000000'; // Native Ethereum
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC on Ethereum

  // Step 1: Create quote with swap embedded in composeFlows
  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: ETH,
            dstToken: USDC,
            srcChainId: 1,
            dstChainId: 1,
            amount: '1000000000000000000', // 1 ETH in wei
            slippage: 0.005 // 0.5%
          }
        }
      ]
    })
  });

  const quote = await quoteResponse.json();

  // Step 2: Sign payload
  const signature = await wallet.signMessage({
    ...quote.payloadToSign[0],
    account
  });

  // Step 3: Execute
  const result = await fetch('https://api.biconomy.io/v1/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      ...quote,
      payloadToSign: [{ ...quote.payloadToSign[0], signature }]
    })
  });

  const { supertxHash } = await result.json();
  ```

  ```bash cURL theme={null}
  # Step 1: Create quote
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/intent-simple",
          "data": {
            "srcToken": "0x0000000000000000000000000000000000000000",
            "dstToken": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "srcChainId": 1,
            "dstChainId": 1,
            "amount": "1000000000000000000",
            "slippage": 0.005
          }
        }
      ]
    }'
  ```
</CodeGroup>

### Aave Deposit via Intent

**Example**: Deposit WETH to get aWETH (expressed as token transformation)

<CodeGroup>
  ```typescript TypeScript theme={null}
  const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // Wrapped ETH
  const aWETH = '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8'; // Aave V3 WETH

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: WETH,
            dstToken: aWETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: '1000000000000000000', // 1 WETH
            slippage: 0.001 // 0.1% slippage for deposits
          }
        }
      ]
    })
  });
  ```

  ```bash cURL theme={null}
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/intent-simple",
          "data": {
            "srcToken": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            "dstToken": "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
            "srcChainId": 1,
            "dstChainId": 1,
            "amount": "1000000000000000000",
            "slippage": 0.001
          }
        }
      ]
    }'
  ```
</CodeGroup>

## 2. Portfolio Management with Intents

Use the `/instructions/intent` compose flow type for complex multi-asset rebalancing.

### Multi-Token LP Entry

**Example**: Deposit multiple stablecoins into Curve 3pool

<CodeGroup>
  ```typescript TypeScript theme={null}
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const curve3poolLP = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        {
          type: '/instructions/intent',
          data: {
            slippage: 0.005,
            inputPositions: [
              {
                chainToken: { chainId: 1, tokenAddress: DAI },
                amount: '10000000000000000000' // 10 DAI
              },
              {
                chainToken: { chainId: 1, tokenAddress: USDC },
                amount: '10000000' // 10 USDC
              },
              {
                chainToken: { chainId: 1, tokenAddress: USDT },
                amount: '10000000' // 10 USDT
              }
            ],
            targetPositions: [
              {
                chainToken: { chainId: 1, tokenAddress: curve3poolLP },
                weight: 1.0 // 100% to LP token
              }
            ]
          }
        }
      ]
    })
  });
  ```

  ```bash cURL theme={null}
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/intent",
          "data": {
            "slippage": 0.005,
            "inputPositions": [
              {
                "chainToken": {
                  "chainId": 1,
                  "tokenAddress": "0x6B175474E89094C44Da98b954EedeAC495271d0F"
                },
                "amount": "10000000000000000000"
              },
              {
                "chainToken": {
                  "chainId": 1,
                  "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
                },
                "amount": "10000000"
              },
              {
                "chainToken": {
                  "chainId": 1,
                  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
                },
                "amount": "10000000"
              }
            ],
            "targetPositions": [
              {
                "chainToken": {
                  "chainId": 1,
                  "tokenAddress": "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"
                },
                "weight": 1.0
              }
            ]
          }
        }
      ]
    }'
  ```
</CodeGroup>

## 3. Composed Strategies

Combine multiple operations in `composeFlows` for complex DeFi strategies.

### Leveraged Staking Position

**Example**: Create 2x leveraged ETH position using Aave with dynamic amounts

<CodeGroup>
  ```typescript TypeScript theme={null}
  const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const aWETH = '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8';
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const aaveV3Pool = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        // Step 1: Deposit initial WETH to Aave
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: WETH,
            dstToken: aWETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: '1000000000000000000', // 1 WETH
            slippage: 0.001
          }
        },
        // Step 2: Borrow USDC against collateral
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
            args: [
              USDC,
              '1000000000', // 1000 USDC
              2, // Variable rate
              0, // No referral
              '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
            ],
            to: aaveV3Pool,
            chainId: 1
          }
        },
        // Step 3: Swap borrowed USDC to WETH
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: USDC,
            dstToken: WETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: '1000000000', // 1000 USDC
            slippage: 0.01
          }
        },
        // Step 4: Deposit swapped WETH back to Aave
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function approve(address spender, uint256 amount)',
            args: [
              aaveV3Pool,
              {
                type: 'runtimeErc20Balance',
                tokenAddress: WETH
              }
            ],
            to: WETH,
            chainId: 1
          }
        },
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: WETH,
            dstToken: aWETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: {
              type: 'runtimeErc20Balance',
              tokenAddress: WETH
            },
            slippage: 0.001
          }
        }
      ]
    })
  });
  ```

  ```bash cURL theme={null}
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/intent-simple",
          "data": {
            "srcToken": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            "dstToken": "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
            "srcChainId": 1,
            "dstChainId": 1,
            "amount": "1000000000000000000",
            "slippage": 0.001
          }
        },
        {
          "type": "/instructions/build",
          "data": {
            "functionSignature": "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
            "args": [
              "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
              "1000000000",
              2,
              0,
              "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
            ],
            "to": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            "chainId": 1
          }
        },
        {
          "type": "/instructions/intent-simple",
          "data": {
            "srcToken": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "dstToken": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            "srcChainId": 1,
            "dstChainId": 1,
            "amount": "1000000000",
            "slippage": 0.01
          }
        }
      ]
    }'
  ```
</CodeGroup>

### Multi-Step Yield Optimization

**Example**: Swap, split, and deploy across multiple protocols using dynamic amounts

<CodeGroup>
  ```typescript TypeScript theme={null}
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const aUSDC = '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c';
  const cDAI = '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        // Swap some USDC to DAI
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: USDC,
            dstToken: DAI,
            srcChainId: 1,
            dstChainId: 1,
            amount: '500000000', // 500 USDC
            slippage: 0.005
          }
        },
        // Deposit remaining USDC to Aave
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: USDC,
            dstToken: aUSDC,
            srcChainId: 1,
            dstChainId: 1,
            amount: {
              type: 'runtimeErc20Balance',
              tokenAddress: USDC
            },
            slippage: 0.001
          }
        },
        // Deposit DAI to Compound
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: DAI,
            dstToken: cDAI,
            srcChainId: 1,
            dstChainId: 1,
            amount: {
              type: 'runtimeErc20Balance',
              tokenAddress: DAI
            },
            slippage: 0.001
          }
        }
      ]
    })
  });
  ```
</CodeGroup>

### Position Migration

**Example**: Move from Compound to Aave

<CodeGroup>
  ```typescript TypeScript theme={null}
  const cETH = '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5';
  const ETH = '0x0000000000000000000000000000000000000000';
  const aWETH = '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        // Withdraw from Compound
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: cETH,
            dstToken: ETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: '5000000000', // cETH amount
            slippage: 0.001
          }
        },
        // Deposit to Aave
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: ETH,
            dstToken: aWETH,
            srcChainId: 1,
            dstChainId: 1,
            amount: '1000000000000000000', // 1 ETH
            slippage: 0.001
          }
        }
      ]
    })
  });
  ```
</CodeGroup>

## 4. Custom Operations (When Intents Won't Work)

Use custom function calls only for operations that can't be expressed as token transformations.

### Borrowing Operations

**Example**: Borrow against collateral (requires custom call)

<CodeGroup>
  ```typescript TypeScript theme={null}
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const aaveV3Pool = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
            args: [
              USDC,
              '1000000000', // 1000 USDC
              2, // Variable interest rate
              0, // No referral code
              '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
            ],
            to: aaveV3Pool,
            chainId: 1,
            value: '0'
          }
        }
      ]
    })
  });
  ```

  ```bash cURL theme={null}
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/build",
          "data": {
            "functionSignature": "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
            "args": [
              "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
              "1000000000",
              2,
              0,
              "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
            ],
            "to": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            "chainId": 1,
            "value": "0"
          }
        }
      ]
    }'
  ```
</CodeGroup>

### Claiming Rewards

**Example**: Harvest staking rewards (requires custom call)

<CodeGroup>
  ```typescript TypeScript theme={null}
  const curveGauge = '0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A';

  const quoteResponse = await fetch('https://api.biconomy.io/v1/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      composeFlows: [
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function getReward()',
            args: [],
            to: curveGauge,
            chainId: 1,
            value: '0'
          }
        }
      ]
    })
  });
  ```

  ```bash cURL theme={null}
  curl -X POST \
    'https://api.biconomy.io/v1/quote' \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: $API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "composeFlows": [
        {
          "type": "/instructions/build",
          "data": {
            "functionSignature": "function getReward()",
            "args": [],
            "to": "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
            "chainId": 1,
            "value": "0"
          }
        }
      ]
    }'
  ```
</CodeGroup>

## Execution Flow

After building your quote with `composeFlows`, sign and execute:

**Step 1**: Create quote with embedded `composeFlows` (shown in examples above)

**Step 2**: Sign the payloads - See [Step 2: Sign Payloads](/supertransaction-api/examples/simple-flow#step-2-sign-payloads) for detailed signing instructions based on `quoteType`.

**Step 3**: Execute the supertransaction - See [Step 3: Execute Transaction](/supertransaction-api/examples/simple-flow#step-3-execute-transaction) for complete execution details and examples.

## Quote and Execute Details

The quote/execute flow works as follows:

1. **Quote Generation** (`/v1/quote`): Returns payloads requiring signatures based on execution mode
   * **Smart Account**: Typically returns `simple` payloads (message signatures)
   * **EOA**: Returns `permit` (gasless) or `onchain` (approval tx) payloads
   * **EIP-7702**: May return 412 error requiring authorization first

2. **Signing**: Sign returned payloads with appropriate method
   * `permit`: EIP-712 typed data signature
   * `simple`: Plain message signature
   * `onchain`: Send approval transaction

3. **Execution** (`/v1/execute`): Submit signed quote to execute across chains

## Best Practices

### Use Intents First

* Express operations as token transformations when possible
* Let the solver network optimize execution paths
* Only use custom calls for non-transferable operations

### Slippage Guidelines

* Stablecoins: 0.001-0.005 (0.1-0.5%)
* Major tokens: 0.005-0.01 (0.5-1%)
* Volatile tokens: 0.01-0.03 (1-3%)
* LP tokens: 0.005-0.02 (0.5-2%)

### Fee Payment Flexibility

* Pay with any ERC-20 from any chain via `feeToken`
* Use native tokens with address `0x0000...0000`
* Omit `feeToken` for sponsored transactions

### Execution Modes

* **Smart Account**: Best for apps with deployed smart accounts
* **EOA**: One-click flow for MetaMask users
* **EIP-7702**: For embedded wallets and backend automation
