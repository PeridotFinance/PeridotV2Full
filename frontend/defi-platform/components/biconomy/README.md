# Biconomy Supply Flow Test Component

A reusable component for testing the cross-chain Biconomy supply flow using `toMultichainNexusAccount` and Fusion mode.

## Overview

This component provides a test interface for the Biconomy cross-chain supply flow. It's designed to work with external EOA wallets (like MetaMask) using Fusion mode, and is easily extensible for Privy smart embedded wallets.

## Files

- **`BiconomySupplyTest.tsx`** - Main test component with UI
- **`use-biconomy-orchestrator.ts`** - Hook for managing orchestrator and MEE client
- **`supply-flow-builder.ts`** - Utility functions for building supply flow instructions (future use)

## Usage

### Basic Usage

```tsx
import { BiconomySupplyTest } from '@/components/biconomy/BiconomySupplyTest';

export default function TestPage() {
  return <BiconomySupplyTest />;
}
```

### Access the Test Page

Navigate to `/app/biconomy-supply-test` to use the test interface.

## Features

1. **Orchestrator Initialization**
   - Automatically creates a multichain Nexus account using `toMultichainNexusAccount`
   - Supports multiple chains (BSC, Arbitrum, Base, etc.)
   - Creates MEE client for gasless execution

2. **Supply Flow**
   - Approve pToken contract to spend underlying token
   - Mint pTokens by supplying underlying
   - Optionally enable as collateral
   - Transfer pTokens back to user's EOA

3. **Fusion Mode**
   - Uses Fusion mode for external EOA wallets
   - Single signature for entire flow
   - Gas paid in ERC-20 tokens (not ETH)

## Current Limitations

1. **Cross-Chain Swap**: The SDK's `buildComposable` doesn't directly support `intent-simple` for cross-chain swaps. For now, the component assumes tokens are already on BSC. To add cross-chain support:
   - Integrate with `/api/biconomy/compose` endpoint for `intent-simple`
   - Include the returned instructions in the Fusion quote

2. **Runtime Balance**: Currently uses fixed amounts. For production, use `runtimeERC20BalanceOf` for dynamic amounts.

## Extending for Privy Smart Wallets

To extend this for Privy smart embedded wallets:

1. **Update `useBiconomyOrchestrator` hook**:
   ```typescript
   // In use-biconomy-orchestrator.ts
   const signer = isPrivyWallet 
     ? createWalletClient({ account: privyAccount, ... })
     : walletClient;
   
   const multichainAccount = await toMultichainNexusAccount({
     signer,
     chainConfigurations,
     // For EIP-7702 mode with embedded wallets
     accountAddress: isPrivyWallet ? address : undefined,
   });
   ```

2. **Use EIP-7702 Mode**:
   - Set `accountAddress` to the EOA address when using embedded wallets
   - Use `.getQuote()` instead of `.getFusionQuote()` for smart accounts
   - No trigger needed for smart accounts (they have native balance)

3. **Update Component**:
   ```typescript
   // Detect wallet type
   const isSmartAccount = usePrivy()?.wallet?.walletClientType === 'privy';
   
   // Use appropriate quote method
   const quote = isSmartAccount
     ? await meeClient.getQuote({ instructions })
     : await meeClient.getFusionQuote({ instructions, trigger, feeToken });
   ```

## Architecture

```
BiconomySupplyTest (Component)
  ├── useBiconomyOrchestrator (Hook)
  │   ├── toMultichainNexusAccount
  │   └── createMeeClient
  └── Supply Flow Execution
      ├── buildComposable (approve, mint, enterMarkets, transfer)
      ├── getFusionQuote (for EOA wallets)
      └── executeFusionQuote
```

## Configuration

The component accepts the following configuration:

- **Source Chain ID**: Chain where tokens originate (currently must be BSC for testing)
- **Source Token**: Token address on source chain
- **Supply Market**: pToken address on BSC
- **Amount**: Amount to supply
- **Slippage**: Slippage tolerance (default: 1%)
- **Enable as Collateral**: Whether to enable the market as collateral
- **Return pTokens**: Whether to transfer pTokens back to user

## Future Improvements

1. **Cross-Chain Swap Integration**: Add API integration for `intent-simple` swaps
2. **Runtime Balance**: Use `runtimeERC20BalanceOf` for dynamic amounts
3. **Privy Integration**: Add support for embedded smart wallets
4. **Error Handling**: Better error messages and recovery
5. **Transaction History**: Track and display past transactions
6. **Gas Estimation**: Show estimated gas costs before execution

## Related Documentation

- [Biconomy Composable Batch Calls](./composable-tach-calls.md)
- [External Wallets Guide](./external-wallets.md)
- [Instruction Build](./instruction-build.md)
- [Instruction Intent](./instruction-intent.md)



