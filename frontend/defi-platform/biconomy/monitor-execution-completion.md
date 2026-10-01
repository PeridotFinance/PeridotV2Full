# Monitor Execution & Completion

After executing a supertransaction with `meeClient.executeQuote(...)`, you need a way to track whether it succeeded. Biconomy MEE provides two main tools to monitor transaction status:

## 1. `waitForSupertransactionReceipt`

This is the **recommended approach** for most use cases.

```ts  theme={null}
const { hash } = await meeClient.executeQuote({ quote });

const receipt = await meeClient.waitForSupertransactionReceipt({
  hash,
  mode: "default",
  confirmations: 2, // optional
});
```

### Parameters

* `hash` (required): The supertransaction hash returned by `executeQuote`
* `confirmations` (optional): How many confirmations to wait for after mining

### When to use

Use this method when you:

* Want a **simple blocking** workflow
* Only proceed after the transaction is complete
* Do **not** need partial updates or background monitoring

### Example

```ts  theme={null}
if (receipt.transactionStatus === "MINED_SUCCESS") {
  console.log("Transaction succeeded!");
} else {
  console.error("Failed:", receipt.transactionStatus);
}
```

## 2. `getSupertransactionReceipt`

This method gives **real-time, snapshot-based access** to the current transaction status.

```ts  theme={null}
const receipt = await meeClient.getSupertransactionReceipt({
  hash,
  mode: "fast-block",
  waitForReceipts: true, // optional
  confirmations: 2, // optional
});
```

### Parameters

* `hash` (required): The supertransaction hash
* `waitForReceipts` (optional, default: true): Wait for receipts before resolving
* `confirmations` (optional): Number of confirmations to wait for

### When to use

Use this method when you:

* Want to **check status in the background**
* Are building your own UI polling or refresh interval
* Don't want to block the app while waiting

### Example

```ts  theme={null}
if (receipt.transactionStatus === "PENDING") {
  console.log("Still waiting...");
} else if (receipt.transactionStatus === "MINED_SUCCESS") {
  console.log("Confirmed on all chains!");
} else {
  console.log("Error or failure:", receipt.transactionStatus);
}
```

You can also inspect individual user operations:

```ts  theme={null}
receipt.userOps.forEach((op) => {
  console.log(`Chain ${op.chainId} status: ${op.executionStatus}`);
});
```

## 3. Supertransaction Wait Mode

<ParamField query="mode" type="string" default="default">
  Transaction confirmation mode. Controls how many confirmations to wait for before returning a response.

  **Options:**

  * `default` - Waits for multiple confirmations (recommended for most use cases)
  * `fast-block` - Returns after 1 block confirmation for faster response times

    <Warning>
      The `fast-block` mode only waits for 1 block confirmation. In worst-case scenarios, the transaction may be reorged or replaced.
    </Warning>
</ParamField>

## 4. Generating a MEE Scan Link

![MeeScan](https://i.imgur.com/IFlRwdW.png)

To let users view their transaction on an explorer:

```ts  theme={null}
import { getMeeScanLink } from "@biconomy/abstractjs";

const link = getMeeScanLink(hash);
console.log("View your transaction:", link);
```

You can also display explorer links from the receipt:

```ts  theme={null}
receipt.explorerLinks.forEach((link) => console.log(link));
```

With these two monitoring tools, you can choose between blocking and non-blocking strategies depending on your app flow. For most users, `waitForSupertransactionReceipt` will be easiest to integrate.
