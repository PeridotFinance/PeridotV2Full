# Setting up AbstractJS

## Installation

```bash  theme={null}
npm install @biconomy/abstractjs viem
```

<Steps>
  <Step title="Basic Setup">
    Import the required dependencies and set up your signer:

    ```typescript  theme={null}
    import { createMeeClient, toMultichainNexusAccount, getMEEVersion, MEEVersion } from "@biconomy/abstractjs";
    import { http } from "viem";
    import { privateKeyToAccount } from "viem/accounts";
    import { base, optimism } from "viem/chains";

    const eoa = privateKeyToAccount(Bun.env.PRIVATE_KEY as `0x${string}`)
    ```
  </Step>

  <Step title="Creating a Multichain Nexus Account">
    Biconomy MEE orchestration uses the Nexus smart account system. The `toMultichainNexusAccount` method calculates addresses for the Nexus account on all specified chains.

    ```typescript  theme={null}
    const orchestrator = await toMultichainNexusAccount({
      chainConfigurations: [
        {
          chain: optimism,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        },
        {
          chain: base,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        }
      ],
      signer: eoa
    })
    ```

    <Info>
      **Lazy Deployment**

      Accounts are not deployed at this point - only their addresses are calculated. Deployment happens just-in-time when the first transaction is pushed to each chain.
    </Info>

    ### Configuration Parameters

    | Parameter        | Description                                                   | Required |
    | ---------------- | ------------------------------------------------------------- | -------- |
    | `chains`         | Array of chains your app will use                             | Yes      |
    | `transports`     | Viem-style transports (RPC URLs) in the same order as chains  | Yes      |
    | `signer`         | The user wallet authorized to perform orchestration           | Yes      |
    | `accountAddress` | Override address for EIP-7702 orchestration (use EOA address) | No       |
  </Step>
</Steps>

## EIP-7702 Enabled Orchestration

For EIP-7702 based orchestration (commonly used with embedded wallets like Privy, Dynamic, Magic), override the account address:

```typescript  theme={null}
const orchestrator7702 = await toMultichainNexusAccount({
  chainConfigurations: [
    {
      chain: optimism,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    },
    {
      chain: base,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    }
  ],
  signer: eoa,
  accountAddress: eoa.address
})
```

### Key Difference

Setting `accountAddress: eoa.address` tells the function to use the EOA address directly instead of calculating smart account deployment addresses. The MEE Relayer will call the `execute` function on the user's EOA address, which requires the user to authorize the Nexus account via EIP-7702 delegation.

## Creating an MEE Client

Orchestration, gasless execution, and all other MEE features are provided by MEE Nodes. Create an MEE client to connect to these nodes:

```typescript  theme={null}
const meeClient = await createMeeClient({
  account: orchestrator,
  apiKey: 'your-api-key',
  url: 'https://mee-node-url'
})
```

[Read the EIP-7702 Guide Here](/new/getting-started/enable-mee-eoa-7702)

### MEE Client Parameters

| Parameter | Description                                                   | Required |
| --------- | ------------------------------------------------------------- | -------- |
| `account` | The orchestrator account instance                             | Yes      |
| `apiKey`  | API key for authentication (rate limiting applied without it) | No       |
| `url`     | MEE Node URL (defaults to Biconomy Network if not specified)  | No       |

<Note>
  When no URL is provided, the client connects to the Biconomy Network - a globally distributed network of MEE Nodes run by professional operators. View operators at [https://token.biconomy.io](https://token.biconomy.io).
</Note>


# Introduction to Orchestration

# Understanding Orchestration

In the [previous doc](/new/learn-about-biconomy/what-is-mee), we explored MEE - Biconomy's infrastructure for one-click blockchain experiences. Now let's dive into its core feature: **Composable Asynchronous Orchestration**.

Consider a simple DeFi operation: swap tokens, then supply to Aave. Today, you have three bad options:

1. **Two separate transactions** → Poor UX, no atomicity
2. **Guess swap outputs** → Failed transactions or lost funds
3. **Custom smart contracts** → Needs Solidity devs, audits, deployments. Can't be modified once deployed.

Now scale this to "swap on Optimism, bridge to Base, supply on Base" - the complexity explodes.

**Biconomy MEE changes this entirely.** Write composable transaction
sequences across multiple chains in TypeScript. Users sign once.
No smart contracts needed. What took days or weeks to develop - now takes minutes.

## What is Orchestration?

Orchestration is a developer primitive that solves fundamental problems in blockchain development.
To understand why it matters, let's first understand what makes blockchain development so painful.

### The Current Reality

When you build blockchain applications today, you face several harsh realities:

1. **Transactions are isolated** - Each transaction knows nothing about the others. You can't use the output of transaction A as the input for transaction B without writing complex smart contracts.

2. **Everything is synchronous** - Function calls execute immediately or fail. They can't wait for external events like tokens arriving from a bridge. This makes cross-chain operations nearly impossible without complex infrastructure.

3. **Amounts must be exact** - If you want to swap tokens and then deposit them, you need to know exactly how many tokens you'll receive from the swap. Guess wrong? Your transaction fails.

4. **Failures are catastrophic** - When step 3 of a 5-step process fails, steps 1 and 2 have already completed. Your users' funds are now stuck in an intermediate state.

5. **Every solution requires smart contracts** - Want to handle these issues? Write Solidity. Deploy contracts. Pay for audits. Repeat for every chain. Months of work for basic functionality.

### Enter Orchestration

Orchestration is an execution layer that makes these problems disappear. Instead of deploying smart contracts to handle complex flows, you write simple scripts that the orchestration layer executes intelligently.

<Info>
  **Trustless Execution**

  Orchestration flows are fully encoded in the `callData` of a batch function call and all execution is enforced onchain.
  This makes these scripts fully verifiable.
</Info>

**Key capabilities:**

**1. Composable Operations**\
Connect operations like Lego blocks. Each operation can use the exact output from the previous one:

```typescript  theme={null}
swap(USDC → ETH) → deposit(exact ETH received) → stake(exact LP tokens received)
```

**2. Asynchronous Execution**\
The orchestration layer can wait for things to happen:

* Tokens to arrive from a bridge
* Prices to reach certain levels
* Balances to meet requirements

No callbacks, no polling - it just waits and continues when ready.

**3. Runtime Intelligence**\
Instead of guessing values when users sign, operations use real values at execution time:

```typescript  theme={null}
// Not this: deposit(0.5 ETH)  // Hope we have it!
// But this: deposit(whatever ETH we actually have)
```

**4. Atomic Grouping with Graceful Failures**\
Operations on the same chain execute atomically (all or nothing). Cross-chain operations handle partial failures gracefully, with automatic cleanup ensuring funds return to users.

**5. Universal Accessibility**\
Write in TypeScript/JavaScript instead of Solidity. Any web developer can now build sophisticated DeFi applications without learning blockchain-specific languages.

### What This Means Practically

Orchestration transforms impossible or extremely difficult tasks into simple ones:

* **"Swap and deposit exactly what I receive"** - Trivial with orchestration, nightmare without it
* **"Wait for my bridge to complete then continue"** - Built-in functionality vs months of infrastructure work
* **"If anything fails, return funds to user"** - Automatic vs complex recovery contracts
* **"Let users pay gas with any token"** - Native support for 1000+ tokens including LP tokens

Think of orchestration as replacing your entire smart contract architecture with an intelligent execution environment that understands time, dependencies, and user intent.

### The Problem

```typescript  theme={null}
// Traditional approach - pick your poison:

// Option 1: Hardcode amounts (fails often)
await token.approve(DEX, 1000)
await dex.swap(1000_USDC → 0.5_ETH)  // What if you get 0.48 ETH?
await aave.supply(0.5_ETH)           // Transaction fails!

// Option 2: Overestimate and leave dust
await token.approve(DEX, 1000)
await dex.swap(1000_USDC → ETH)     // Get 0.48 ETH
await aave.supply(0.4_ETH)           // 0.08 ETH stuck as dust
```

<Warning>
  **Result**

  Either have failures, two user signatures or overestimate and leave dust
</Warning>

### The Smart Contract "Solution"

Before orchestration, you'd write something like this:

```solidity  theme={null}
contract SwapAndSupply {
    function execute(uint256 amount) external {
        IERC20(USDC).transferFrom(msg.sender, address(this), amount);
        
        uint256 ethReceived = DEX.swap(USDC, ETH, amount);
        
        // Handle exact amounts in Solidity
        if (ethReceived > 0) {
            AAVE.supply(ETH, ethReceived);
        }
        
        // Return dust
        uint256 remaining = IERC20(ETH).balanceOf(address(this));
        if (remaining > 0) {
            IERC20(ETH).transfer(msg.sender, remaining);
        }
    }
}
```

<Warning>
  **Result**

  Requires Solidity developer, audits and deployments on every chain. Can't be easily updated.
</Warning>

### The Orchestration Solution

```typescript  theme={null}
const swapInstruction = await orchestrator.buildComposable({
  type: 'default',
  data: {
    abi: dexAbi,
    params: [
      usdcAddress,
      wethAddress,
      inputAmount
    ]
  }
})

const supplyInstruction = await orchestrator.buildComposable({
  type: 'default',
  data: {
    abi: lendingMarketAbi,
    params: [
      wethAddress,

      // Composably inject the exact amount received from the 
      // swap into the "amount" parameter of the supply function
      runtimeERC20BalanceOf({
        targetAddress: orchestrator.addressOn(optimism.id),
        token: wethAddress,
        constraints: [balanceNotZeroConstraint]
      })
    ]
  }
})

// Execute atomically & composably on single chain
const { hash } = mee.execute({
  instructions: [
    swapInstruction, supplyInstruction
  ],
  // ... the rest of parameters
})
```

<Check>
  **Result**

  10 minutes of development + \$0 audits + instant updates
</Check>

**What just happened?**

* No smart contracts needed
* No guessing swap outputs
* No dust left behind
* Any JavaScript developer can build this

## Cross-Chain Orchestration: Where It Gets Interesting

Now let's tackle something that makes developers cry: cross-chain operations.

### The Async Bridge Challenge

Traditional onchain execution is fully syncronous. Users signs a transcation, it gets posted onchain and executed
immediately. Real world development is asynchronous.

Often times, you need to wait for funds to arrive from a bridge, for an oracle to update or for some other
onchain state to change. Until now, building these flows was either impossible or extremely time consuming and
requiring deep Solidity knowledge.

Orchestration makes it quick, easy and accessible to TypeScript developers.

### How Async Execution Actually Works

Here's the clever bit - MEE doesn't use event listeners or callbacks. Instead, it uses **simulation-based waiting**:

```typescript  theme={null}
  // Step 1: Bridge USDC from Optimism to Base
  const bridgeInstruction = await orchestrator.buildComposable({
    type: 'default',
    data: {
      abi: bridgeAbi,
      chainId: optimism.id,
      to: BRIDGE_ADDRESS,
      functionName: 'bridge',
      args: [USDC, parseUnits('1000', 6), BASE_CHAIN_ID]
    }
  })
  
  // Step 2: Swap on Base (waits automatically!)
  const swapInstruction = await orchestrator.buildComposable({
    type: 'default',
    data: {
      abi: dexAbi,
      to: DEX_ON_BASE,
      chainId: base.id,
      functionName: 'swap',
      args: [
        USDC,
        ETH,

        // Dynamically injects the exact amount
        // received from the bridge into the parameter
        // of the function call
        runtimeErc20BalanceOf({
          target: orchestrator.addressOn(optimism.id)
          token: USDC,

          // The orchestrator will wait with execution until 
          // constraints are met.
          constraints: [balanceNotZeroConstraint]
        })
      ]
    }
  })

```

**Behind the scenes:**

1. MEE simulates the swap transaction
2. Simulation fails (no USDC on Base yet)
3. MEE waits and retries periodically
4. Bridge completes, funds arrive
5. Simulation succeeds, transaction executes

No complex infrastructure. Just patient simulation.

### The Critical Role of Constraints

Those `constraints` parameters aren't just safety checks - they're what makes async execution possible.

Constraints create the "wait until ready" behavior that enables true asynchronous orchestration.

## Intelligent Failure Handling

Not all failures are created equal. Orchestration understands the difference between atomic operations and cross-chain flows.

### Single-Chain: All or Nothing

Operations on the same chain execute atomically:

```typescript  theme={null}
const defiStrategy = async (ctx) => {
  await swap(USDC → ETH)      // If this fails...
  await supply(ETH → AAVE)     // This never executes
  await stake(aTokens)         // Neither does this
}
// Result: User keeps original USDC, no partial states
```

### Cross-Chain: Graceful Recovery

When operations span chains, orchestration handles partial completion:

```typescript  theme={null}
const crossChainFlow = async (ctx) => {
  // Atomic on Optimism
  await swap(USDC → ETH)
  await wrap(ETH → WETH)
  
  // Bridge might fail
  await bridge(WETH → Base)
  
  // If Base operation fails, cleanup runs
  await unwrap(WETH → ETH)  
  await buyNFT(ETH)
}
```

### Automatic Cleanup: Your Safety Net

Every orchestration can include cleanup instructions that act as a safety net:

```typescript  theme={null}
const quote = await meeClient.getQuote({
  instructions: [...yourStrategy],
  cleanUps: [
    {
      tokenAddress: USDC,
      chainId: base.id,
      recipientAddress: userAddress,
      // No amount = use runtime balance (all remaining funds)
    }
  ]
})
```

**How cleanup works:**

* Uses nonce-based dependencies to execute after main operations
* Detects remaining balances automatically
* Supports multiple tokens with separate cleanup operations


# Batch Composable Cross-Chain Calls

This tutorial shows how to:

1. **Bridge** USDC from **Arbitrum** to **Base** using Across
2. **Swap** bridged USDC → WETH on Base via Uniswap V3
3. **Supply** the WETH to Morpho RE7's WETH pool
4. **Return** the RE7 vault tokens back to the user's EOA

All steps run as **one Fusion transaction** with gas paid in USDC.

## Demo of Composable Orchestration

<div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
  <iframe src="https://www.loom.com/embed/04c21d08208d4c789c6af3b4c74b1d03?sid=ddebfd28-c367-4726-82b5-c25c2eb6d3d4" frameBorder="0" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
</div>

## Why this matters

With **one user signature** you can:

* Bridge, swap, stake — any multi-step flow — without asking the user to sign again.
* Pay **all gas for every step** in **one ERC-20 (USDC)** instead of native ETH on multiple chains.
* Leave **zero "dust"**: every last token that isn't needed is auto-returned to the user.
* Keep the user in a single, familiar wallet; no pop-ups, no chain switching, no scary approvals.

### Business impact

<Table>
  <thead>
    <tr>
      <th>Pain today</th>
      <th>Benefit with this flow</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>Users rage-quit after the 2nd confirm</td>
      <td>**Single click** → drastically lower drop-off</td>
    </tr>

    <tr>
      <td>Confusing gas settings on multiple chains</td>
      <td>**One token, one fee** shown up front</td>
    </tr>

    <tr>
      <td>Support tickets about stuck "dust"</td>
      <td>No residual balances, fewer refunds</td>
    </tr>

    <tr>
      <td>Weeks of Solidity + audits</td>
      <td>**All TypeScript**, ship in hours</td>
    </tr>
  </tbody>
</Table>

Developers get shorter build cycles; users get a smoother checkout-style experience. That's higher conversion and faster feature delivery with almost no smart-contract risk.

## Key Concepts Used

<Table>
  <thead>
    <tr>
      <th>Concept</th>
      <th>Why it's needed</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>**Fusion trigger**</td>
      <td>Starts orchestration from an empty EOA with one `transfer` / `permit`</td>
    </tr>

    <tr>
      <td>**`runtimeERC20BalanceOf`**</td>
      <td>Injects *whatever* tokens arrive from bridge or swap</td>
    </tr>

    <tr>
      <td>**Constraint `greaterThanOrEqualTo`**</td>
      <td>Ensures we meet minimum slippage tolerance</td>
    </tr>

    <tr>
      <td>**`balanceNotZeroConstraint`** (implicit)</td>
      <td>Used for ordering when bridged tokens haven't landed yet</td>
    </tr>
  </tbody>
</Table>

## Code Walk‑Through

Below we highlight the critical parts of `supplyToMorpho.ts`. Full file lives in your repo.

<Steps>
  <Step title="Initialise Multichain Account & MEE Client">
    ```ts  theme={null}
    const oNexus = await toMultichainNexusAccount({
      signer: walletProvider,           // Embedded or EOA signer
      chainConfigurations: [
        {
          chain: arbitrum,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        },
        {
          chain: base,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        }
      ],
    });

    const meeClient = await createMeeClient({ account: oNexus });
    ```
  </Step>

  <Step title="Define Trigger & Constraints">
    ```ts  theme={null}
    const amountConsumed = parseUnits(amount, 6);
    const minAfterSlippage = amountConsumed * 80n / 100n;  // 20 % tolerance
    const executionConstraints = [greaterThanOrEqualTo(minAfterSlippage)];

    const transferToNexusTrigger = {
      tokenAddress: mcUSDC.addressOn(arbitrum.id),
      amount: amountConsumed,
      chainId: arbitrum.id,
    };
    ```

    <Info>
      **Why**: Fusion mode starts with an empty orchestrator. A single USDC transfer funds it and reveals the amount we'll use.
    </Info>
  </Step>

  <Step title="Bridge USDC with Across">
    Follow the [Across Integration Tutorial]() to learn how to encode Across.

    ```ts  theme={null}
    const depositAcrossData = await prepareAcrossBridgeTransaction({
      depositor: oNexus.addressOn(arbitrum.id),
      recipient: oNexus.addressOn(base.id),
      inputToken: mcUSDC.addressOn(arbitrum.id),
      outputToken: mcUSDC.addressOn(base.id),
      inputAmount: amountConsumed,
      originChainId: arbitrum.id,
      destinationChainId: base.id,
    });
    ```

    Two instructions are added:

    1. **Approve** USDC to Across
    2. **Raw calldata** deposit
  </Step>

  <Step title="Swap USDC → WETH on Base">
    ```ts  theme={null}
    const swapUSDCtoWeth = await oNexus.buildComposable({
      type: "default",
      data: {
        chainId: base.id,
        abi: UniswapSwapRouterAbi,
        to: mcUniswapSwapRouter.addressOn(base.id),
        functionName: "exactInputSingle",
        args: [{
          tokenIn: mcUSDC.addressOn(base.id),
          amountIn: runtimeERC20BalanceOf({
            tokenAddress: mcUSDC.addressOn(base.id),
            targetAddress: oNexus.addressOn(base.id, true),
            constraints: executionConstraints,
          }),
          tokenOut: weth_Base,
          recipient: oNexus.addressOn(base.id, true),
          amountOutMinimum: 0n,
          fee: 100,
          sqrtPriceLimitX96: 0n,
        }],
      },
    });
    ```

    `runtimeERC20BalanceOf` waits until bridged USDC arrives and meets `executionConstraints`.
  </Step>

  <Step title="Supply WETH to Morpho & Return Vault Tokens">
    ```ts  theme={null}
    const supplyToMorpho = await oNexus.buildComposable({
      type: "default",
      data: {
        abi: MorphoPoolAbi,
        to: weth_Re7_Morpho_Pool,
        chainId: base.id,
        functionName: "deposit",
        args: [
          runtimeERC20BalanceOf({
            tokenAddress: weth_Base,
            targetAddress: oNexus.addressOn(base.id, true),
            constraints: executionConstraints,
          }),
          oNexus.addressOn(base.id, true),
        ],
      },
    });
    ```

    Then transfer RE7 vault tokens back to the user EOA.
  </Step>

  <Step title="Quote & Execute Fusion Transaction">
    ```ts  theme={null}
    const quote = await meeClient.getFusionQuote({
      trigger: transferToNexusTrigger,
      feeToken: toFeeToken({ mcToken: mcUSDC, chainId: arbitrum.id }),
      instructions: [
        approveUsdcSpendToAcross,
        depositAcross,
        approveUniswapToSpendUSDC,
        swapUSDCtoWeth,
        approveMorphoVaultToSpendWeth,
        supplyToMorpho,
        moveRe7WethBackToEOA,
      ],
    });

    const { hash } = await meeClient.executeFusionQuote({ fusionQuote: quote });
    ```
  </Step>
</Steps>

## What You Achieved

* One signature → multi‑step, cross‑chain flow
* Gas paid in USDC, no ETH needed
* Exact amounts supplied, no guesswork
* Vault tokens automatically returned to user

Extend this flow by adding staking, leverage, or any other operation—without writing Solidity.
