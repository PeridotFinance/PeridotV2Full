# Move DeFi Positions With One Signature

> Enable one-click DeFi position migration across protocols with atomic execution and runtime balance resolution

## Overview

Your users are earning yield on other DeFi protocols when they discover better rates on your protocol. Simple enough for them to move, right? In practice, position migration involves coordination challenges that often aren't worth the effort for your users.

Consider this scenario: your users are earning yield on another protocol and find better rates on yours. They have four options:

<CardGroup cols={2}>
  <Card title="Multiple manual transactions" icon="hand-dots">
    Withdraw, approve, deposit - each step requiring signatures and gas fees
  </Card>

  <Card title="Custom migration contracts" icon="code">
    Rarely built due to development complexity, audit costs, and smart contract risk
  </Card>

  <Card title="Accept the status quo" icon="pause">
    Stay put because the migration effort outweighs the benefit
  </Card>

  <Card title="Risk manual operations at scale" icon="triangle-exclamation">
    For funds managing large positions, manual multi-step processes create operational risk and require careful coordination
  </Card>
</CardGroup>

When your users scale this across chains or more complex positions, most simply don't migrate despite better opportunities on your protocol. For larger funds, the operational risk of manual coordination becomes a significant concern that keeps them locked in suboptimal positions elsewhere.

<Note>
  Biconomy Move changes this entirely. Your users can move positions from any DeFi protocols to yours with a single signature. They click once. Everything happens atomically. What required careful multi-step coordination now happens seamlessly.
</Note>

## What is Move?

Move is a feature that allows your DeFi positions to simply migrate anywhere you want, in a single operation. It solves the fundamental coordination problem that makes protocol migration so painful today.

### Use Cases

<CardGroup cols={2}>
  <Card title="Lending positions" icon="chart-line">
    Find higher yield opportunities
  </Card>

  <Card title="Borrow positions" icon="percent">
    Find cheaper borrow rates
  </Card>

  <Card title="Version migration" icon="code-branch">
    Moving between versions e.g. Moving between Aave V3 to Aave V4
  </Card>

  <Card title="Expiring positions" icon="clock">
    Moving your expiring Pendle position to a new one
  </Card>
</CardGroup>

## How Move Works

Move makes the problems associated with migrating any DeFi position a thing of the past. Instead of managing complex multi-step processes manually, users trigger intelligent migration flows that handle all the complexity automatically.

### Fusion Mode Integration

<Info>
  Works with any wallet (MetaMask, Rabby, etc.) through Biconomy's Fusion Mode - no special wallet software required.
</Info>

## Key Capabilities

### 1. Atomic Cross-Protocol Operations

Your entire position moves in one coordinated flow:

```
withdraw(entire Aave position) → approve(exact amount) → deposit(exact amount to Venus)
```

### 2. Runtime Amount Resolution

Instead of guessing balances, Move uses exact amounts at execution time:

```javascript
// Not this: withdraw(1.5 ETH) // Hope that's still your balance!
// But this: withdraw(runtimeBalance(aTokens)) // Exact amount including accrued interest
```

### 3. Gasless Execution

Optional gas sponsorship means users can migrate positions without holding ETH. Pay with the tokens you're already moving.

### 4. Graceful Failure Handling & Atomic Execution

If any step fails, automatic cleanup ensures funds return safely to your wallet. No partial states, no stuck funds.

<Note>
  If you're moving positions on a single chain — all execution is done atomically.
</Note>

## Example: AAVE to Venus Migration

This example demonstrates a complete migration from AAVE to Venus Protocol using Move's composable orchestration:

<Steps>
  <Step title="Transfer Accrued Interest">
    ```javascript
    const transferInterest = await nexusAccount.buildComposable({
      type: 'transferFrom',
      data: {
        recipient: nexusAccountAddress,  // Companion Account address
        sender: accountAddress,          // User's EOA
        tokenAddress: position.aTokenAddress,
        amount: runtimeERC20BalanceOf({
          targetAddress: accountAddress,
          tokenAddress: position.aTokenAddress,
          constraints: [greaterThanOrEqualTo(100n)],
        }),
        chainId,
        gasLimit: 100000n,
      },
    });
    ```
  </Step>

  <Step title="Withdraw Entire AAVE Position">
    ```javascript
    const withdrawFromAave = await nexusAccount.buildComposable({
      type: 'default',
      data: {
        to: aaveV3PoolContractAddress,
        abi: aaveV3PoolAbi,
        functionName: 'withdraw',
        args: [
          position.tokenAddress,        // Asset to withdraw
          MAX_UINT256.toFixed(),       // Amount (MAX = entire position)
          nexusAccountAddress,         // Recipient
        ],
        chainId,
        gasLimit: 100000n,
      },
    });
    ```
  </Step>

  <Step title="Approve Venus to Spend Tokens">
    ```javascript
    const approveVenus = await nexusAccount.buildComposable({
      type: 'approve',
      data: {
        tokenAddress: position.tokenAddress,
        spender: vToken.address,
        amount: runtimeERC20BalanceOf({
          targetAddress: nexusAccountAddress,
          tokenAddress: position.tokenAddress,
          constraints: [greaterThanOrEqualTo(100n)],
        }),
        chainId,
        gasLimit: 100000n,
      },
    });
    ```
  </Step>

  <Step title="Mint vTokens on Venus">
    ```javascript
    const mintVTokens = await nexusAccount.buildComposable({
      type: 'default',
      data: {
        to: vToken.address,
        abi: vBep20Abi,
        functionName: 'mintBehalf',
        args: [
          accountAddress,  // Mint on behalf of user's EOA
          runtimeERC20BalanceOf({
            targetAddress: nexusAccountAddress,
            tokenAddress: position.tokenAddress,
            constraints: [greaterThanOrEqualTo(100n)],
          }),
        ],
        chainId,
        gasLimit: 100000n,
      },
    });
    ```
  </Step>
</Steps>

### Creating the Fusion Quote

```javascript
// Buffer the approval amount to account for interest accrual
const approvalAmount = buffer({
  amountMantissa: position.userATokenBalanceWithInterestsMantissa,
});

const fusionQuote = await meeClient.getFusionQuote({
  trigger: {
    chainId,
    tokenAddress: position.aTokenAddress,
    amount: position.userATokenBalanceMantissa,
    approvalAmount,  // Buffered amount
    gasLimit: 500000n,
  },
  instructions: [
    transferInterest,
    withdrawFromAave,
    approveVenus,
    mintVTokens
  ],
  sponsorship: true,  // Enable gasless execution
});
```

### Key Features Demonstrated

<CardGroup cols={2}>
  <Card title="Runtime Balance Resolution" icon="clock-rotate-left">
    Uses `runtimeERC20BalanceOf` to capture exact amounts at execution time
  </Card>

  <Card title="Atomic Execution" icon="lock">
    All operations succeed together or fail together with automatic cleanup
  </Card>

  <Card title="Buffer Strategy" icon="shield">
    Accounts for interest accrual between signing and execution
  </Card>

  <Card title="Gasless Execution" icon="gas-pump">
    Optional gas sponsorship for seamless user experience
  </Card>

  <Card title="Fusion Mode" icon="wallet">
    Works with any external wallet through Companion Account mechanism
  </Card>
</CardGroup>

## Summary

Think of Move as replacing the entire manual coordination of DeFi position movements with an automated system that understands protocol dependencies, timing, and user safety.