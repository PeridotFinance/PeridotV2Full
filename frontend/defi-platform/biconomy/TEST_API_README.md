# Biconomy API Testing Script

This script tests both the **old REST API approach** and the **new SDK approach** to help determine which method works and how to migrate.

## Quick Start

### 1. Set Environment Variables

Create a `.env.local` file or export these variables:

```bash
# Required for REST API tests
export NEXT_PUBLIC_BICONOMY_APIKEY="your-api-key-here"

# Required for SDK tests (optional, but recommended)
export TEST_PRIVATE_KEY="0x..." # A test private key (don't use your main wallet!)
export TEST_USER_ADDRESS="0x..." # The address corresponding to TEST_PRIVATE_KEY
```

### 2. Install Dependencies (if needed)

```bash
pnpm install
# or
npm install
```

### 3. Install tsx (if not already installed)

```bash
pnpm add -D tsx
# or
npm install -D tsx
```

### 4. Run the Test

```bash
pnpm test:biconomy-api
# or
npm run test:biconomy-api
# or directly with tsx
npx tsx biconomy/test-api-approaches.ts
# or with bun (if available)
bun biconomy/test-api-approaches.ts
```

## What the Script Tests

### REST API Tests

1. **Compose Endpoint** (`/v1/instructions/compose`)
   - Tests if the old REST endpoint still works
   - Uses the same structure as your current `biconomyAdapter.ts`
   - Checks for 404 errors

2. **Quote Endpoint** (`/v1/mee/quote`)
   - Tests if the quote endpoint is accessible
   - Validates the response structure

### SDK Tests

1. **Orchestrator Creation** (`toMultichainNexusAccount`)
   - Tests creating a multichain Nexus account
   - Verifies addresses are generated correctly

2. **MEE Client Creation** (`createMeeClient`)
   - Tests creating the MEE client
   - Verifies methods are available

3. **Build Composable** (`orchestrator.buildComposable`)
   - Tests building instructions using the SDK
   - Tests both `approve` and `default` instruction types

4. **Fusion Quote** (`meeClient.getFusionQuote`)
   - Tests getting a quote using the SDK approach
   - Validates the quote structure

## Understanding the Results

### ✅ REST API Works, ❌ SDK Fails
- **Action**: Continue using REST API
- **Note**: Monitor for deprecation notices

### ❌ REST API Fails, ✅ SDK Works
- **Action**: Migrate to SDK approach
- **Migration Guide**: See below

### ✅ Both Work
- **Action**: Consider migrating to SDK for better features
- **Timeline**: Plan migration when convenient

### ❌ Both Fail
- **Action**: Check API key, network, and Biconomy status
- **Debug**: Review error messages in output

## Migration Guide (If REST API is Deprecated)

### Old Approach (REST API)

```typescript
// Old way - direct fetch
const composeBody = {
  ownerAddress: userAddress,
  mode: 'eoa',
  composeFlows: [
    {
      type: '/instructions/intent-simple',
      data: { /* ... */ }
    }
  ]
};

const response = await fetch('/api/biconomy/compose', {
  method: 'POST',
  body: JSON.stringify(composeBody)
});
```

### New Approach (SDK)

```typescript
import {
  toMultichainNexusAccount,
  createMeeClient,
  getMEEVersion,
  MEEVersion,
} from '@biconomy/abstractjs';
import { http } from 'viem';
import { arbitrum, bsc } from 'viem/chains';

// 1. Create orchestrator
const orchestrator = await toMultichainNexusAccount({
  signer: walletClient, // Your wallet client
  chainConfigurations: [
    {
      chain: arbitrum,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0),
    },
    {
      chain: bsc,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0),
    },
  ],
});

// 2. Create MEE client
const meeClient = await createMeeClient({ account: orchestrator });

// 3. Build instructions
const bridgeInstruction = await orchestrator.buildComposable({
  type: 'default',
  data: {
    // Bridge logic here
  },
});

const approveInstruction = await orchestrator.buildComposable({
  type: 'approve',
  data: {
    spender: pTokenAddress,
    tokenAddress: underlyingToken,
    chainId: bsc.id,
    amount: runtimeERC20BalanceOf({ /* ... */ }),
  },
});

// 4. Get quote
const quote = await meeClient.getFusionQuote({
  instructions: [bridgeInstruction, approveInstruction],
  trigger: {
    chainId: sourceChainId,
    tokenAddress: sourceToken,
    amount: amountWei,
  },
  feeToken: {
    address: sourceToken,
    chainId: sourceChainId,
  },
});

// 5. Execute
const { hash } = await meeClient.executeFusionQuote({ fusionQuote: quote });
```

## Key Differences

| Aspect | REST API | SDK |
|--------|----------|-----|
| **Setup** | Direct fetch calls | Create orchestrator + MEE client |
| **Instructions** | Manual JSON structure | `buildComposable()` helper |
| **Runtime Values** | `runtimeErc20Balance` object | `runtimeERC20BalanceOf()` function |
| **Quote** | `/v1/mee/quote` endpoint | `meeClient.getFusionQuote()` |
| **Execute** | `/v1/mee/execute` endpoint | `meeClient.executeFusionQuote()` |
| **Type Safety** | Manual typing | Full TypeScript support |
| **Error Handling** | Manual parsing | SDK error types |

## Troubleshooting

### "Missing BICONOMY_API_KEY"
- Set `NEXT_PUBLIC_BICONOMY_APIKEY` in your environment
- Or set `BICONOMY_API_KEY`

### "Missing TEST_PRIVATE_KEY"
- SDK tests will be skipped
- Set `TEST_PRIVATE_KEY` to enable SDK tests
- **Warning**: Use a test key, not your main wallet!

### "404 Not Found" on Compose Endpoint
- The REST endpoint may be deprecated
- Check Biconomy documentation for migration guide
- Consider using SDK approach

### SDK Tests Fail
- Verify `@biconomy/abstractjs` is up to date: `pnpm update @biconomy/abstractjs`
- Check that your test private key has funds (for gas)
- Verify RPC endpoints are accessible

## Next Steps

1. **Run the test** to see current status
2. **Review results** to understand what works
3. **Check Biconomy docs** for latest API status
4. **Plan migration** if REST API is deprecated
5. **Update codebase** to use working approach

## Additional Resources

- [Biconomy Documentation](https://docs.biconomy.io)
- [SDK Examples](./external-wallets.md)
- [Fusion Mode Guide](./fuision-mode.md)
- [Composable Calls Guide](./composable-tach-calls.md)

