# Pay Gas With ERC-20 Tokens

<Warning>
  **Prerequisites**: This tutorial assumes you've read the [Enable MEE for EOA Users](/new/getting-started/enable-mee-eoa-users) and understand EIP-7702 based execution and Fusion execution.
</Warning>

Biconomy MEE enables developers to offer **flexible, chain-agnostic gas payments using any ERC-20 token**, even across chains. Unlike older systems, such as ERC-4337, MEE supports true **cross-chain gas payments**, letting users pay for transactions on one chain using tokens from another.

This unlocks powerful UX patterns:

* Users can pay gas **without native tokens**.
* Gas can be paid with thousands of tokens, even using **lending position tokens (e.g. aUSDC), LP tokens, governance tokens, derivatives**, and more.
* Integrate with DeFi-native flows where users already hold non-native tokens.

## 1. EIP-7702 EOAs (Used With Embedded Wallets)

Smart-account logic is installed directly on the EOA. Just pass a `feeToken` when quoting. EIP-7702 supports
same-chain *and* cross-chain gas (using tokens from one chain to pay for transaction on another).

Learn how to [set up EIP-7702 on your EOA](/new/getting-started/enable-mee-eoa-7702)

```ts
const quote = await meeClient.getQuote({
  instructions: [{
    calls: [{ to: zeroAddress, value: 0n }],
    chainId: optimism.id
  }],

  // mandatory for 7702 orchestration
  delegate: true,  
  
  // user-signed or supplied manually
  authorization,      
  feeToken: {
    address: usdcAddresses[base.id],

    // pay gas on Base while executing on Optimism
    chainId: base.id  
  }
});
```

<Note>
  **Not just stablecoins**: Supports **any ERC-20 token** as the gas token—including wrapped assets and derivatives. Multiple tokens can be used per quote.
</Note>

## 2. Fusion Mode (Used With External Wallets)

[Learn how to set up Fusion Mode](/new/getting-started/enable-mee-eoa-fusion)

Fusion uses a **Trigger + Companion Account**. Fusion mode is used when working with External Wallets such as MetaMask, Rabby, Trust, ... Fusion mode must be used with those wallets as they *don't* allow apps to install code on EOAs through EIP-7702.

The token that funds the trigger **must also be the gas token**.

Fusion mode is limited to using only tokens on the same chain to pay for gas, but has the broadest wallet coverage (does not require EIP-7702 or Smart Account)

```ts
const trigger: Trigger = {
  chainId: optimism.id,
  tokenAddress: usdcAddresses[base.id],
  amount: parseUnits('2', 6)
};

const sendOneUSDCInstruction: Instruction = {
  chainId: base.id,
  calls: [{
    to: usdcAddresses[base.id],
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [eoa.address, parseUnits('1', 6)]
    })
  }]
};

const feeToken: FeeTokenInfo = {
  address: trigger.tokenAddress,
  chainId: trigger.chainId
};

const { quote } = await meeClient.getFusionQuote({
  trigger,
  instructions: [sendOneUSDCInstruction],
  feeToken
});
```

**Caveats:**

* If token supports **ERC-2612 (ERC20Permit)**, trigger is gasless.
* If not, user must first send an `approve()` tx (gas is needed).
* Fusion requires **same token for trigger and gas payment**.
* Only **one token per user signature** is supported.

## 3. Native Smart Contract Accounts (SCAs)

Use MEE Nexus SCAs to execute on one chain and pay gas on another.

```ts
const sendOneUSDCInstruction: Instruction = {
  chainId: base.id,
  calls: [{
    to: usdcAddresses[base.id],
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [eoa.address, parseUnits('1', 6)]
    })
  }]
};

const payGasWithUsdcOnOptimism: FeeTokenInfo = {
  address: usdcAddresses[optimism.id],
  chainId: base.id
};

const quote = await meeClient.getQuote({
  instructions: [sendOneUSDCInstruction],
  feeToken: payGasWithUsdcOnOptimism
});
```

Most flexible mode. Any supported ERC-20 token from any supported chain can be used to pay for gas.

Requires EOA users to deposit manually to a smart account address. Creates onboarding friction.

## Key Takeaways

* Use **any ERC-20**—not just standard tokens, but **LPs, lending receipts, governance tokens**, and more.
* Execute on one chain, pay on another.
* Choose orchestration method based on wallet type:
  * EIP-7702: simplest
  * Fusion: requires trigger
  * SCAs: most advanced, composable
* Fusion requires ERC20Permit for gasless usage.
* Consider gas sponsorship to remove all gas costs for users.

Check token compatibility, orchestration mode, and user wallet type to determine the best pattern for your app.

# Supported Gas Tokens

The Biconomy MEE uses a solver based approach for accepting gas tokens. If our solvers know how to convert your token into `ETH` or `USDC` - we can accept the token as gas.

This means you can use tokens such as AAVE/Venus/Morpho Position tokens (e.g. `aUSDC`, `vUSDT`, ...), you can use Uniswap LP position tokens, staked tokens, governance tokens, etc...

This means that - for most cases - you can just deduct the token which is actually being used for the transaction to pay for some of the gas.

Beyond this - gas abstraction and gas sponsorship are multi-chain so you can use any of the thousands of gas tokens on any of the supported chains to pay for execution of a transaction on any other supported chain.

## Integrated Gas Solvers

<CardGroup cols={2}>
  <Card title="GlueX" href="https://dapp.gluex.xyz/">
    Available now
  </Card>

  <Card title="LiFi" href="https://li.fi/">
    Coming Soon
  </Card>
</CardGroup>