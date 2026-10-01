# Set Execution Time Bounds

MEE supports **time-bounded execution windows** using `lowerBoundTimestamp` and `upperBoundTimestamp`. These parameters let you defer execution or enforce expiration on quotes, enabling powerful UX like scheduled actions, delayed bridging, market timing, and more.

## Why Use Time Bounds?

* **Scheduled execution** (e.g. trigger after a certain amount of time)
* **Custom expiry** (e.g. keep trying to execute for five minutes, if simulation is error still - then discard)
* **Sequential execution** (e.g. execute a transaction every five minutes)

## Setup

```ts
import { createMeeClient, toMultichainNexusAccount, getMEEVersion, MEEVersion } from "@biconomy/abstractjs";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";

const eoa = privateKeyToAccount(Bun.env.PRIVATE_KEY as Hex);
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
});

const date = new Date();

const meeClient = await createMeeClient({
  account: orchestrator
});

const minutesToSeconds = (input: number) => input * 60;
```

## Instant Execution (Default Expiry)

Executes immediately and simulates until it passes or hits a 2-minute timeout.

```ts
const instantTxDefaultExpiryTime = await meeClient.getQuote({
  instructions: [],
  feeToken: {
    address: '0xYourFeeTokenAddress',
    chainId: base.id
  },
});
```

## Instant Execution with Custom Expiry

Runs immediately but expires 1 minute after quote creation if it still errors.

```ts
const instantTxCustomExpiry = await meeClient.getQuote({
  instructions: [],
  feeToken: {
    address: '0xYourFeeTokenAddress',
    chainId: base.id
  },
  upperBoundTimestamp: Date.now() + minutesToSeconds(1)
});
```

## Scheduled Execution

Quote won't be eligible to run until 5 minutes from now.

```ts
const scheduledTxQuote = await meeClient.getQuote({
  instructions: [],
  feeToken: {
    address: '0xYourFeeTokenAddress',
    chainId: base.id
  },
  lowerBoundTimestamp: Date.now() + minutesToSeconds(5)
});
```

## Bounded Window Execution

Will only attempt execution between 2 and 5 minutes from quote creation.

```ts
const boundedTx = await meeClient.getQuote({
  instructions: [],
  feeToken: {
    address: '0xYourFeeTokenAddress',
    chainId: base.id
  },
  lowerBoundTimestamp: Date.now() + minutesToSeconds(2),
  upperBoundTimestamp: Date.now() + minutesToSeconds(5)
});
```

## Developer Tips

* Timestamps are expected in **seconds**, not milliseconds.
* Quotes simulate continuously within the window. If execution fails for the full duration, they will revert.
* If both `lowerBoundTimestamp` and `upperBoundTimestamp` are omitted, quotes execute immediately with a 2-minute fallback.
* Use in combination with cleanup for robust, failure-tolerant flows.

Time-bounded scheduling unlocks a whole new level of control over supertransactions—giving developers precision orchestration primitives without needing custom schedulers or off-chain cron jobs.