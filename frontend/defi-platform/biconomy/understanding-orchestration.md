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

```typescript
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

```typescript
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

```typescript
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

```solidity
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

```typescript
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

```typescript
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

```typescript
const defiStrategy = async (ctx) => {
  await swap(USDC → ETH)      // If this fails...
  await supply(ETH → AAVE)     // This never executes
  await stake(aTokens)         // Neither does this
}
// Result: User keeps original USDC, no partial states
```

### Cross-Chain: Graceful Recovery

When operations span chains, orchestration handles partial completion:

```typescript
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

```typescript
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
* Only executes if balance ≥ 1 wei (prevents empty transactions)
* Supports multiple tokens with separate cleanup operations