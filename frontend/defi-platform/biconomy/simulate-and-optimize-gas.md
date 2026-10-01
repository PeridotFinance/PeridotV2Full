# Simulation and Gas Estimation

Simulation enables you to preview and test your supertransactions in a forked mainnet environment before committing them on-chain. This crucial step helps you validate transaction logic, optimize gas costs, and prevent costly execution failures.

## What is Simulation?

Simulation executes your supertransaction against a forked blockchain network to validate its behavior without broadcasting it on-chain. This allows you to:

* **Validate transaction execution** - Test if your supertransaction will execute successfully across single or multiple chains
* **Apply token overrides** - Test different token amounts and scenarios without using real assets
* **Optimize gas limits** - Get precise gas estimates to set tight, optimal gas limits for your User Operations
* **Catch failures early** - Identify and fix configuration errors before sending transactions on-chain

<Info>
  **Best Practice**: Always simulate your supertransactions before sending them on-chain. This helps you set optimal gas limits, minimize transaction fees, and catch potential failures early in the development cycle.
</Info>

## Why Simulation Matters

### Cost Optimization

Simulations provide precise gas estimates, allowing you to set tight gas limits that minimize fees while ensuring successful execution.

### Error Prevention

By testing transactions before submitting it on-chain, you can identify and fix issues such as:

* Incorrect parameter configurations
* Insufficient token allowances
* Failed cross-chain routing
* Logical errors in instruction sequencing

### Faster Development

Identify and fix bugs before submitting your supertransaction for execution. This dramatically improves the debugging experience by eliminating long orchestration wait times to discover failures, while preventing costly failed on-chain transactions.

## Simulation Examples

Simulation works for both single-chain and multi-chain supertransactions. Here are common use cases:

### Single-Chain Operations

* **Swap → Lend → Borrow → Withdraw** - Perform multiple DeFi actions in a single atomic transaction
* **Multi-step protocols** - Chain together various protocol interactions on the same chain

### Multi-Chain Operations

* **Swap → Bridge → Swap** - Exchange tokens on one chain, bridge to another, then swap again
* **Complex DeFi flows** - Execute sophisticated strategies that span multiple networks

## Simulation Overrides

Overrides allow you to customize the blockchain state during simulation, enabling you to test your supertransactions under specific conditions. There are two types of overrides available:

### Token Overrides

Token overrides let you set specific token balances for accounts during simulation. This is essential for testing multi-chain flows where tokens need to exist on destination chains.

```typescript  theme={null}
const overrides = {
  tokenOverrides: [
    {
      tokenAddress: "0xUSDC",
      chainId: base.id,
      balance: parseUnits("1000", 6),
      accountAddress: orchestrator.addressOn(base.id, true),
    },
  ],
};
```

<Note>
  **Important notes for token overrides:**

  * For native token overrides (ETH, MATIC, etc.), use the zero address (`0x0000000000000000000000000000000000000000`) as the token address
  * For funding transactions (triggers), token overrides are automatically added by the MEE node. If you explicitly configure additional token overrides for the same token, they will be summed with the trigger amount
</Note>

### Custom Overrides

Custom overrides provide advanced control over blockchain state by allowing you to modify any storage slot of a contract. This is useful for complex scenarios that go beyond simple token balance adjustments.

```typescript  theme={null}
const overrides = {
  customOverrides: [
    {
      contractAddress: "0xUSDC",
      storageSlot: "0xbalance_storage_slot_user",
      chainId: base.id,
      value: parseUnits("1000", 6),
    },
  ],
};
```

<Tip>
  Custom overrides are a general-purpose mechanism for advanced use cases. Use them when you need to simulate specific contract states that aren't achievable through token overrides alone.
</Tip>

### Complete Override Example

You can combine both token and custom overrides in a single simulation:

```typescript  theme={null}
const overrides = {
  tokenOverrides: [
    {
      tokenAddress: "0xUSDC",
      chainId: base.id,
      balance: parseUnits("1000", 6),
      accountAddress: orchestrator.addressOn(base.id, true),
    },
  ],
  customOverrides: [
    {
      contractAddress: "0xUSDC",
      storageSlot: "0xbalance_storage_slot_user",
      chainId: base.id,
      value: parseUnits("1000", 6),
    },
  ],
};
```

## Running a Simulation

<Steps>
  <Step title="Configure your supertransaction">
    Set up your supertransaction with all required parameters, including target chains, tokens, and instructions.
  </Step>

  <Step title="Execute simulation">
    Execute one of the methods that returns the quote to initiate the simulation and receive quote information along with simulation results.
  </Step>

  <Step title="Review results">
    Analyze gas estimates, and any warnings or errors returned by the simulation.
  </Step>

  <Step title="Apply adjustments">
    Make necessary changes based on simulation results, then re-simulate to verify corrections.
  </Step>
</Steps>

## Code Example

### Single-Chain Simulation

Here's how to enable simulation for a single-chain supertransaction:

```typescript  theme={null}
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { 
  toMultichainNexusAccount,
  getMEEVersion, MEEVersion,
  createMeeClient 
} from "@biconomy/abstractjs";
import { http } from "viem";

const eoaAccount = privateKeyToAccount(generatePrivateKey());

const orchestrator = await toMultichainNexusAccount({
  chainConfigurations: [
    {
      chain: base,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    }
  ],
  signer: eoaAccount
});

const meeClient = await createMeeClient({
  account: orchestrator,
});

const fusionQuote = await meeClient.getFusionQuote({
  // Token overrides for triggers are automatically handled by the MEE node
  trigger: {
    tokenAddress: '0xyour-token-address',
    amount: 1n,
    chainId: base.id,
  },
  // Enable simulation to validate and estimate gas
  simulation: {
    simulate: true,
  },
  instructions: [...],
  feeToken: {
    address: '0xyour-token-address',
    chainId: base.id,
  },
});
```

<Note>
  When `simulation.simulate` is set to `true`, the MEE node will execute your supertransaction against a forked blockchain network. This estimates accurate gas limits and attach it to your userOps and validates that your transaction will execute successfully before you commit it on-chain.
</Note>

### Multi-Chain Simulation with Token Overrides

For multi-chain supertransactions, you'll need to provide token overrides to simulate the expected token balances on destination chains:

```typescript  theme={null}
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import {
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
  createMeeClient,
} from "@biconomy/abstractjs";
import { http, parseUnits, zeroAddress } from "viem";

const eoaAccount = privateKeyToAccount(generatePrivateKey());

const orchestrator = await toMultichainNexusAccount({
  chainConfigurations: [
    {
      chain: optimism,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0),
    },
    {
      chain: base,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0),
    },
  ],
  signer: eoaAccount,
});

const meeClient = await createMeeClient({
  account: orchestrator,
});

// Composable Across bridge operation to move your tokens from Optimism to Base
const optimismToBaseAcrossCall = await orchestrator.buildComposable({
  type: "acrossIntent",
  data: {
    depositor: orchestrator.addressOn(optimism.id, true),
    recipient: orchestrator.addressOn(base.id, true),
    inputToken: "0xUSDC",
    outputToken: "0xDAI",
    inputAmountRuntimeParams: {
      targetAddress: orchestrator.addressOn(optimism.id, true),
      tokenAddress: "0xUSDC",
      constraints: [],
    },
    approximateExpectedInputAmount: parseUnits("2", 6), // USDC 6 decimals
    originChainId: optimism.id,
    destinationChainId: base.id,
    message: "0x",
    relayerAddress: zeroAddress,
  },
});

const fusionQuote = await meeClient.getFusionQuote({
  // Token overrides for triggers are automatically handled by the MEE node
  trigger: {
    tokenAddress: "0xyour-token-address",
    amount: 1n,
    chainId: base.id,
  },
  // For multi-chain transactions, provide token overrides to simulate 
  // expected balances on destination chains
  simulation: {
    simulate: true,
    overrides: {
      tokenOverrides: [
        {
          tokenAddress: "0xUSDC",
          chainId: base.id,
          // Simulate token balance on destination chain
          balance: parseUnits("1000", 6),
          accountAddress: orchestrator.addressOn(base.id, true),
        },
      ],
    },
  },
  // Add custom instructions after bridging
  instructions: optimismToBaseAcrossCall,
  feeToken: {
    address: "0xyour-token-address",
    chainId: base.id,
  },
});
```

<Tip>
  **Token overrides** let you simulate how your supertransaction will behave with specific token balances on destination chains. This is crucial for multi-chain operations where tokens will arrive after bridging, allowing you to test the entire flow including post-bridge instructions.
</Tip>

## Speed vs Cost Optimization

When building supertransactions, you face a fundamental tradeoff between execution speed and cost optimization. Choosing the right strategy depends on your application's priorities and user expectations.

### The Tradeoff

<AccordionGroup>
  <Accordion defaultOpen="true" title="Simulation: Optimal Cost, Slower Execution">
    **Latency:** \~600ms additional overhead

    **Benefits:**

    * Provides tight, precise gas limits that minimize user costs
    * Validates transaction execution before submission
    * Catches errors early in the development cycle
    * Eliminates guesswork in gas estimation

    **Best for:**

    * Production applications where cost optimization matters
    * Complex multi-chain flows that need validation
    * Scenarios where you're uncertain about gas requirements
    * User-facing applications where transparent pricing improves conversion
  </Accordion>

  <Accordion defaultOpen="true" title="Manual Gas Limits: Fast Execution, Manual Tuning Required">
    **Latency:** No additional overhead

    **Benefits:**

    * Immediate execution without simulation delay
    * Full control over gas parameters
    * Optimal for high-frequency or time-sensitive operations

    **Trade-offs:**

    * Requires knowledge of exact gas requirements
    * Risk of setting limits too high (inflated quotes) or too low (transaction failures)
    * No pre-execution validation

    **Best for:**

    * High-speed execution requirements
    * Well-tested transaction patterns with known gas costs
    * Applications where 600ms matters significantly
    * Teams with strong gas optimization expertise
  </Accordion>
</AccordionGroup>

### Decision Matrix

Choose your approach based on these criteria:

| Priority                      | Recommended Approach | Reasoning                                   |
| ----------------------------- | -------------------- | ------------------------------------------- |
| **Cost optimization**         | Enable simulation    | Tight gas limits = lower quotes = better UX |
| **Execution speed**           | Manual gas limits    | Skip \~600ms simulation overhead            |
| **Development/Testing**       | Enable simulation    | Catch issues early, iterate faster          |
| **Production (first launch)** | Enable simulation    | Validate behavior, optimize costs           |
| **Production (mature app)**   | Manual gas limits    | Known patterns, prioritize speed            |
| **Complex multi-chain flows** | Enable simulation    | Validation is critical                      |

<Warning>
  **Critical:** Enabling simulation will override any manually configured gas limits with optimized values calculated from simulation results. You cannot use both approaches simultaneously.
</Warning>

### Making the Choice

**Start with simulation** during development and early production. Once your transaction patterns are stable and well-understood, you can optionally switch to manual gas limits for the speed benefit—but only if the 600ms overhead is a genuine bottleneck for your use case.

## Setting Manual Gas Limits

AbstractJS assigns **generous default gas limits** to every instruction so you can prototype quickly without tweaking `gasLimit` values. Once you move to production, those defaults become sub-optimal—quotes may look expensive and confuse users.

### Why You Should Care

<Info>
  Understanding the difference between development and production gas limit strategies is crucial for user experience.
</Info>

| Stage             | Default behaviour                             | Impact                                         |
| ----------------- | --------------------------------------------- | ---------------------------------------------- |
| **PoC / testing** | High gas limits keep dev friction near-zero   | Faster iterations                              |
| **Production**    | High limits over-inflate the **quoted price** | Users see a larger "max cost" and may drop off |

### Quote vs. Actual Cost

<Note>
  The price returned by `meeClient.getQuote()` is a **maximum**. If you overshoot, MEE refunds all unspent gas to the user **on-chain**.
</Note>

Lowering `gasLimit` keeps the quote realistic and improves conversion, without risking "out of gas" as long as you size it sensibly.

### How to Set Manual Limits

Add a `gasLimit` field (in wei) to each instruction's `data` object:

```typescript  theme={null}
const instruction = await orchestrator.buildComposable({
  type: "default",
  data: {
    abi: erc20Abi,
    to: "0xUSDC_ADDRESS",
    chainId: optimism.id,
    functionName: "transfer",
    args: [
      "0xRecipient",
      parseUnits("10", 6),
    ],
    gasLimit: 35_000n, // manual limit
  },
});
```

### Recommended Workflow

<Steps>
  <Step title="Start high">
    Observe gas used in testnet with generous limits
  </Step>

  <Step title="Trim the limit">
    Set limit to \~20% above observed usage
  </Step>

  <Step title="Ship to production">
    Deploy with explicit limits so quotes stay tight
  </Step>
</Steps>

### Key Takeaways

* High defaults are fine for development, but tune gas limits before mainnet launch
* Quotes show maximum cost; unused gas is always refunded
* Tight gas limits result in accurate quotes that build user trust and reduce transaction abandonment
* Simulation provides the tightest gas estimates but adds \~600ms latency
* Manual gas limits offer faster execution when you know the requirements
