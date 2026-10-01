# Getting started

Getting started with the Supertransaction API can be done in minutes!

<Steps>
  <Step title="Get the API Key">
    Visit [https://dashboard.biconomy.io](https://dashboard.biconomy.io) and get your API Key by creating an MEE stack project!
  </Step>

  <Step title="Call the build/compose API">
    Call the API endpoint to build your desired transaction flow.
  </Step>

  <Step title="Execute">
    Call the Execute APIs to send the encoded Supertransaction to Biconomy
    Network Relayers.
  </Step>
</Steps>

# Step by step guide

<Steps>
  <Step title="Set Your Account Type">
    <Tabs>
      <Tab title="EOA">
        Standard wallets (MetaMask, Rabby, Trust)

        * Requires funding tokens
        * One signature per token
      </Tab>

      <Tab title="EOA-7702">
        Embedded wallets with EIP-7702 support (Privy, Dynamic)

        * May need authorization
        * Single execution signature
      </Tab>

      <Tab title="Smart Account">
        ERC-7579 accounts (Biconomy Nexus)

        * Simplest flow
        * Always one signature
      </Tab>
    </Tabs>

    [Read detailed guide](/supertransaction-api/execution-modes/choose-execution-mode)
  </Step>

  <Step title="Build Instructions">
    <Tabs>
      <Tab title="Simple Intent">
        `/instructions/intent-simple`

        Simple swaps and bridges between two tokens
      </Tab>

      <Tab title="Complex Intent">
        `/instructions/intent`

        Multi-token operations with weighted outputs
      </Tab>

      <Tab title="Custom Build">
        `/instructions/build`

        Low-level custom contract calls
      </Tab>

      <Tab title="Compose">
        `/instructions/compose`

        Combine multiple instructions and intents
      </Tab>
    </Tabs>

    [Read detailed guide](/supertransaction-api/endpoints/quote)
  </Step>

  <Step title="Get a Quote">
    Call `/v1/mee/quote` with:

    * Your chosen account type
    * From address
    * Instructions from Step 2
    * Funding tokens (EOA only)
    * Optional fee token preferences

    **Returns:**

    * Quote details with supertx hash
    * Payloads to sign
    * Fee information
    * Quote type (simple/permit/onchain)

    [Read detailed guide](/supertransaction-api/explainer/sign)
  </Step>

  <Step title="Sign the Payloads">
    <Tabs>
      <Tab title="EOA">
        **One signature per funding token**

        * **Permit**: Sign EIP-712 data (supertx hash in deadline)
        * **Onchain**: Send transaction (supertx hash in calldata)
      </Tab>

      <Tab title="EOA-7702">
        **Check authorization first**

        1. If 412 error: Sign authorization, retry quote
        2. Sign one simple message for execution
      </Tab>

      <Tab title="Smart Account">
        **Simplest signing**

        Always sign one simple message
      </Tab>
    </Tabs>
  </Step>

  <Step title="Execute">
    Call `/v1/mee/execute` with:

    * From address
    * Fee details
    * Quote type
    * Original quote
    * Signed payloads from Step 4

    **Returns:**

    * Success status
    * Supertransaction hash for tracking
  </Step>
</Steps>

## Key Points

* **EOA** requires funding tokens and may need multiple signatures
* **EOA-7702** may require authorization before execution
* **Smart Account** is simplest with always one signature
* The API embeds supertx hash into signatures to link funding with execution
* All cross-chain operations execute atomically

# About

Supertransaction API enables developers to build end-to-end DeFi, stablecoin and yield workflows without writing smart contracts, auditing or manually integrating bridges, swap providers or intent solvers.

All workflows are executed gaslessly, with a single user signature - even if they span multiple blockchains.

## What does it mean for you?

<CardGroup cols={3}>
  <Card title="10x Faster Shipping" icon="rocket">
    Replace manual bridge & swap provider integrations or writing/auditing contracts with a single API call.
  </Card>

  <Card title="Impossibly Smooth UX" icon="sparkles">
    Your users sign only once to execute any number of function calls across any number of chains.
  </Card>

  <Card title="Gas Abstraction" icon="gas-pump">
    All flows are gas abstracted by default. Users can either pay in 10k+ ERC-20 tokens or you can sponsor their gas.
  </Card>
</CardGroup>

## How does it work?

<Info>
  The Supertransaction API works by allowing native composability between multiple integrated service providers. There are two main modes available:
</Info>

<Tabs>
  <Tab title="Smart Multi-Chain Router">
    The developer simply specifies the input and output tokens and chains and the Supertransaction API will query multiple integrators to find the optimal route to achieve this action with the best price available on the market.

    ```bash
    https://api.biconomy.io/v1/intent
    ```
  </Tab>

  <Tab title="Custom Calls">
    The developer specifies a specific contract which they want to call on a specific chain. Custom calls can be *composed* together with intelligent routing providers to enable pre and post actions.

    ```bash
    https://api.biconomy.io/v1/build
    ```
  </Tab>
</Tabs>

## Composing Multiple Actions

The `/compose` endpoint allows you to chain multiple operations together - combining swaps, bridges, and custom calls into a single workflow. This enables complex DeFi strategies with one signature.

```javascript
// Example: Swap across chains, then stake in one transaction
const response = await fetch('/v1/instructions/compose', {
  method: 'POST',
  body: JSON.stringify({
    ownerAddress: "0x742d35cc...",
    mode: "smart-account",
    composeFlows: [
      {
        type: "/instructions/intent",
        data: {
          slippage: 0.01,
          inputPositions: [{
            chainToken: { chainId: 8453, tokenAddress: "0x833589..." },
            amount: "1000000000"
          }],
          targetPositions: [{
            chainToken: { chainId: 10, tokenAddress: "0x94b008..." },
            weight: 1
          }]
        }
      },
      {
        type: "/instructions/build",
        data: {
          functionSignature: "function stake(uint256)",
          args: ["1000000"],
          to: "0x1111111...",
          chainId: 10
        }
      }
    ]
  })
});
```

## Execution Engine

<Note>
  The execution engine for all workflows done through the Supertransaction API is the Biconomy **Modular Execution Environment** (MEE). It's a multi-chain, trustless network of Relayers (called MEE Nodes) which can execute **Supertransactions.**
</Note>

A Supertransaction is a data model which can represent multiple EVM function calls across multiple chains with a single hash. By signing this hash, the user can approve an entire workflow with a single signature.

<Check>
  Biconomy MEE has built in retry mechanisms, high reliability, low latency and high throughput. It's able to serve all clients — from one-person startups to large enterprises.
</Check>

## Industry-Leading Security

<Warning>
  The Supertransaction API stack has been audited by four independent auditors:
</Warning>

<CardGroup cols={4}>
  <Card>
    <Icon icon="shield-check" />

    **Cyfrin**
  </Card>

  <Card>
    <Icon icon="shield-check" />

    **Spearbit**
  </Card>

  <Card>
    <Icon icon="shield-check" />

    **Zenith**
  </Card>

  <Card>
    <Icon icon="shield-check" />

    **Pashov**
  </Card>
</CardGroup>

## Platform Metrics

<CardGroup cols={2}>
  <Card title="70M+" icon="chart-line">
    **Processed Transactions**

    Total transactions processed through our infrastructure
  </Card>

  <Card title="10M+" icon="users">
    **Total Users**

    Total lifetime infra users
  </Card>

  <Card title="$3.5B+" icon="dollar-sign">
    **Volume Processed**

    Total transaction volume handled
  </Card>

  <Card title="4.5M+" icon="wallet">
    **Smart Accounts**

    Smart accounts created
  </Card>
</CardGroup>

## Features

<CardGroup cols={2}>
  <Card title="Workflow Composer" icon="diagram-project">
    Chain together swaps, bridges, lending, staking, and more into one user action.
  </Card>

  <Card title="Single-Signature" icon="signature">
    No matter how many actions or chains your workflow spans, your user always signs once.
  </Card>

  <Card title="Gas Abstraction" icon="coins">
    Abstract gas; your users can pay for execution in thousands of ERC-20 tokens.
  </Card>

  <Card title="Multi-Chain Support" icon="link">
    **Supports 16+ chains**
  </Card>

  <Card title="Safe by Design" icon="shield">
    Battle-tested infrastructure and audited integrations.
  </Card>

  <Card title="Drop-in Integration" icon="plug">
    Works with embedded wallets, external wallets (e.g., MetaMask), or custody.
  </Card>

  <Card title="Never worry about gas again" icon="battery-full">
    We handle gas sponsorship and settlement so your users don't need native tokens.
  </Card>

  <Card title="Add protocols in minutes" icon="clock">
    Use our prebuilt actions or compose your own multi-step flows.
  </Card>
</CardGroup>


# Cross-Chain Intent Router

> Build complex multi-chain intents for your supertransaction

## Overview

The `/v1/instructions/intent` endpoint enables users to express their desired outcome without specifying implementation details. Users define input tokens and target output tokens with weights, and the system automatically determines the optimal execution path.

## How It Works

The intent endpoint abstracts away complexity by:

1. **Accepting input positions** - Specify source tokens with amounts (e.g., USDC on Base)
2. **Defining target positions** - Specify desired output tokens with weights that must sum to 1
3. **Automatic routing** - The system finds the best path between tokens, handling:
   * Withdrawals from source protocols
   * Cross-chain bridging
   * Swaps and conversions
   * Deposits into destination protocols

## Request Structure

```
POST /v1/instructions/intent
```

### Request Body

| Parameter         | Type   | Required | Description                                                                 |
| ----------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `slippage`        | number | Yes      | Slippage tolerance between 0 and 1 (e.g., 0.003 for 0.3%)                   |
| `ownerAddress`    | string | Yes      | The EVM address that will receive the output of the intent request          |
| `inputPositions`  | array  | Yes      | Array of source tokens with amounts (minimum 1 item)                        |
| `targetPositions` | array  | Yes      | Array of target tokens with weights (minimum 1 item, weights must sum to 1) |

### Input Position Structure

```json
{
  "chainToken": {
    "chainId": number,        // Supported chain ID
    "tokenAddress": string    // Valid EVM token address
  },
  "amount": string           // Amount in wei/smallest unit
}
```

### Target Position Structure

```json
{
  "chainToken": {
    "chainId": number,        // Supported chain ID  
    "tokenAddress": string    // Valid EVM token address
  },
  "weight": number           // Weight between 0 and 1
}
```

## Example Request

### Single Asset Swap

Convert USDC on Base to a vault token on Base:

```bash
curl -X POST https://api.biconomy.io/v1/instructions/intent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "slippage": 0.003,
    "ownerAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "inputPositions": [
      {
        "chainToken": {
          "chainId": 8453,
          "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        },
        "amount": "1000000"
      }
    ],
    "targetPositions": [
      {
        "chainToken": {
          "chainId": 8453,
          "tokenAddress": "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"
        },
        "weight": 1
      }
    ]
  }'
```

### Multi-Asset Portfolio Rebalance

Convert multiple input tokens to a diversified portfolio:

```javascript
const response = await fetch('https://api.biconomy.io/v1/instructions/intent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    slippage: 0.005,
    ownerAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    inputPositions: [
      {
        chainToken: {
          chainId: 1,
          tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC on Ethereum
        },
        amount: '5000000000' // 5000 USDC
      },
      {
        chainToken: {
          chainId: 10,
          tokenAddress: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' // USDC on Optimism
        },
        amount: '3000000000' // 3000 USDC
      }
    ],
    targetPositions: [
      {
        chainToken: {
          chainId: 8453,
          tokenAddress: '0x4200000000000000000000000000000000000006' // WETH on Base
        },
        weight: 0.6 // 60% allocation
      },
      {
        chainToken: {
          chainId: 8453,
          tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
        },
        weight: 0.4 // 40% allocation
      }
    ]
  })
});
```

## Response Structure

The endpoint returns MEE instructions that will be executed to fulfill the intent:

```json
{
  "instructions": [
    {
      "calls": [
        {
          "to": "0x1111111254EEB25477B68fb85Ed929f73A960582",
          "value": "0",
          "functionSig": "transfer(address,uint256)",
          "inputParams": [...],
          "outputParams": [...]
        }
      ],
      "chainId": 8453,
      "isComposable": true
    }
  ]
}
```

### Response Fields

| Field                         | Type    | Description                                     |
| ----------------------------- | ------- | ----------------------------------------------- |
| `instructions`                | array   | Array of MEE instructions to execute            |
| `instructions[].calls`        | array   | Contract calls within the instruction           |
| `instructions[].chainId`      | number  | Chain ID where instruction executes             |
| `instructions[].isComposable` | boolean | Whether instruction can be composed with others |

## Error Responses

### 400 Bad Request

Invalid request parameters:

```json
{
  "code": "INVALID_REQUEST",
  "message": "Invalid input parameters",
  "errors": [
    {
      "code": "INVALID_WEIGHT_SUM",
      "path": ["targetPositions"],
      "message": "Target position weights must sum to 1"
    }
  ]
}
```

### 500 Internal Server Error

Server processing error:

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Failed to process intent",
  "errors": [...]
}
```

## Key Considerations

### Weight Distribution

Target position weights must sum to exactly 1.0. For example:

* Single target: weight = 1.0
* Two targets with equal split: weight = 0.5 each
* Three targets: e.g., 0.5, 0.3, 0.2

### Slippage Settings

* Minimum: 0 (no slippage tolerance)
* Maximum: 1 (100% slippage)
* Recommended: 0.003 - 0.01 (0.3% - 1%)
* Higher slippage may be needed for:
  * Low liquidity tokens
  * Large trade sizes
  * Cross-chain operations

### Cross-Chain Intents

The system automatically handles:

* Bridge selection and routing
* Gas optimization across chains
* Atomic execution guarantees
* Failure recovery mechanisms

## Intent vs Direct Instructions

The Supertransaction API offers two approaches:

| Approach                                           | Use Case                                             | Control Level               |
| -------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| **Intent-based** (this endpoint)                   | Express desired outcome, system determines execution | High-level abstraction      |
| **Direct instructions** (`/v1/instructions/build`) | Explicitly specify each step                         | Full control over execution |

The intent approach simplifies complex multi-chain operations by automatically:

* Finding optimal routes
* Handling protocol interactions
* Managing cross-chain complexity
* Optimizing for gas efficiency

## Security Requirements

All requests must include:

* Valid API key in the `X-API-Key` header
* Proper content type: `application/json`
* Valid EVM addresses (checksummed)
* Supported chain IDs