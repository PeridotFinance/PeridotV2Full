# Get Started with External Wallets

This quickstart shows how to use **Biconomy MEE's Fusion execution mode** to batch-send ERC-20 tokens (USDC) on a **single chain (Base Sepolia)** using a regular **EOA wallet (e.g. MetaMask)**. It demonstrates how an externally owned account can:

* Batch transfer tokens to multiple recipients
* Pay for gas using **ERC-20 tokens** (not ETH)
* Do this all with a **single signature**
* Without using smart wallets or EIP-7702

## Why not EIP-7702?

<AccordionGroup>
  <Accordion title="Wallets don't allow apps to install code">
    While EIP-7702 allowed for smart account code to be set to the EOA address on the *blockchain* level - all major wallets prevent apps from installing their own code onto users EOA addresses. This is done due to the security concerns wallets have around apps installing malicious code.
  </Accordion>

  <Accordion title="Apps access user funds by requesting permissions">
    The approach wallets have taken is to expose a set of permissions to the apps where they can "request" certain tokens, etc... This effort has been spearheaded by MetaMask with their ERC-7715 integration and their DeleGator framework.
  </Accordion>

  <Accordion title="Unclear how the space will develop">
    Other major wallets (Rabby, Trust, Rainbow, Coinbase, Phantom, Uniswap, ...) have not publically stated whether they'll add support for ERC-7715.
  </Accordion>

  <Accordion title="Biconomy offers universal solution">
    The method Biconomy uses is universally compatible with *all* EOA wallets which means you can count on offering these features to everyone.
  </Accordion>
</AccordionGroup>

<Info>
  **Use EIP-7702 with Biconomy + Embedded Wallets**

  Biconomy has full support for EIP-7702. If you wish to take advantage of those features - build by using embedded wallets (e.g. Privy, Dynamic, Turnkey, ...)
</Info>

## How It Works

With Fusion, externally owned accounts (EOAs) can authorize a **Companion Smart Account** (aka "Orchestrator") to pull tokens and execute instructions. The Companion is invisible to users, acting as a passthrough executor that handles batching, permissions, and fee payments.

### Flow Summary

<Steps>
  <Step title="User Authorization">
    The user signs a quote from MEE authorizing their Companion to pull tokens (e.g. USDC)
  </Step>

  <Step title="Batch Execution">
    The Companion executes the batched instructions, using the pulled tokens to:

    * pay for gas
    * send funds to multiple recipients
  </Step>

  <Step title="Seamless Experience">
    From the user's perspective, they signed once and completed the action — no additional UX overhead
  </Step>
</Steps>

## Setup

### 1. Create the project

```bash  theme={null}
bun create vite fusion-single-chain --template react-ts
cd fusion-single-chain
bun install
```

### 2. Install dependencies

```bash  theme={null}
bun add viem wagmi @biconomy/abstractjs
bun add @tanstack/react-query ethers # peer deps for wagmi
```

### 3. Wrap App in providers

Edit `main.tsx` to include `WagmiProvider` and `QueryClientProvider`:

```tsx  theme={null}
// src/main.tsx
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';
import App from './App';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>
);
```

Then create `wagmi.ts`:

```ts  theme={null}
// src/wagmi.ts
import { baseSepolia } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';

export const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http()
  }
});
```

## Key Concepts in App

### Wallet & Companion Initialization

First, we need to connect to the wallet extension. This tutorial uses the `window.ethereum` method, but you should use a more comprehensive solution (e.g. ReOwn AppKit, Web3Modal, RainbowKit, ...)

```ts  theme={null}
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: custom(window.ethereum)
});

const orchestrator = await toMultichainNexusAccount({
  chainConfigurations: [
    {
      chain: baseSepolia,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    }
  ],
  signer: walletClient
});

const meeClient = await createMeeClient({ account: orchestrator });
```

### Building Transfer Instructions

You batch multiple `transfer` instructions using `orchestrator.buildComposable(...)`:

```ts  theme={null}
const transfers = await Promise.all(
  recipients.map((recipient) =>
    orchestrator.buildComposable({
      type: 'default',
      data: {
        abi: erc20Abi,
        chainId: baseSepolia.id,
        to: usdcAddress,
        functionName: 'transfer',
        args: [recipient, 1_000_000n] // 1 USDC in 6 decimals
      }
    })
  )
);
```

### Triggering Fusion Execution

Fusion flows require a **trigger** that pulls tokens from the EOA:

```ts  theme={null}
const fusionQuote = await meeClient.getFusionQuote({
  instructions: transfers,
  trigger: {
    chainId: baseSepolia.id,
    tokenAddress: usdcAddress,
    amount: totalAmount // no maxAvailableFunds
  },
  feeToken: {
    address: usdcAddress,
    chainId: baseSepolia.id
  }
});
```

The signature over this quote includes the hash of all instructions and the fee + pull logic. One signature does it all.

### Execute & Monitor

```ts  theme={null}
const { hash } = await meeClient.executeFusionQuote({ fusionQuote });

await meeClient.waitForSupertransactionReceipt({ hash });
const link = getMeeScanLink(hash);
```

***

## Full Example Files

<Tabs>
  <Tab title="App.tsx">
    ```tsx  theme={null}
    import { useState } from 'react';
    import {
      createWalletClient,
      custom,
      erc20Abi,
      http,
      type WalletClient,
      type Hex,
      formatUnits
    } from 'viem';
    import { baseSepolia } from 'viem/chains';
    import {
      createMeeClient,
      toMultichainNexusAccount,
      runtimeERC20BalanceOf,
      greaterThanOrEqualTo,
      getMeeScanLink,
      type MeeClient,
      type MultichainSmartAccount,
      getMEEVersion,
      MEEVersion
    } from '@biconomy/abstractjs';
    import { useReadContract } from 'wagmi';

    export default function App() {
      const [account, setAccount] = useState<string | null>(null);
      const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
      const [meeClient, setMeeClient] = useState<MeeClient | null>(null);
      const [orchestrator, setOrchestrator] = useState<MultichainSmartAccount | null>(null);
      const [status, setStatus] = useState<string | null>(null);
      const [meeScanLink, setMeeScanLink] = useState<string | null>(null);
      const [recipients, setRecipients] = useState<string[]>(['']);

      const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

      const { data: balance } = useReadContract({
        abi: erc20Abi,
        address: usdcAddress,
        chainId: baseSepolia.id,
        functionName: 'balanceOf',
        args: account ? [account as Hex] : undefined,
        query: { enabled: !!account }
      });

      const connectAndInit = async () => {
        if (typeof (window as any).ethereum === 'undefined') {
          alert('MetaMask not detected');
          return;
        }

        const wallet = createWalletClient({
          chain: baseSepolia,
          transport: custom((window as any).ethereum)
        });
        setWalletClient(wallet);

        const [address] = await wallet.requestAddresses();
        setAccount(address);

        const multiAccount = await toMultichainNexusAccount({
          chainConfigurations: [
            {
              chain: baseSepolia,
              transport: http(),
              version: getMEEVersion(MEEVersion.V2_1_0)
            }
          ],
          signer: createWalletClient({
            account: address,
            transport: custom((window as any).ethereum)
          })
        });
        setOrchestrator(multiAccount);

        const mee = await createMeeClient({ account: multiAccount });
        setMeeClient(mee);
      };

      const executeTransfers = async () => {
        if (!orchestrator || !meeClient || !account) {
          alert('Account not initialized');
          return;
        }

        try {
          setStatus('Encoding instructions…');

          await walletClient?.addChain({ chain: baseSepolia });
          await walletClient?.switchChain({ id: baseSepolia.id });

          const transfers = await Promise.all(
            recipients
              .filter((r) => r)
              .map((recipient) =>
                orchestrator.buildComposable({
                  type: 'default',
                  data: {
                    abi: erc20Abi,
                    chainId: baseSepolia.id,
                    to: usdcAddress,
                    functionName: 'transfer',
                    args: [recipient as Hex, 1n * 10n ** 6n] // 1 USDC
                  }
                })
              )
          );

          const totalAmount = BigInt(transfers.length) * 1_000_000n;

          setStatus('Requesting quote…');
          const fusionQuote = await meeClient.getFusionQuote({
            instructions: transfers,
            trigger: {
              chainId: baseSepolia.id,
              tokenAddress: usdcAddress,
              amount: totalAmount
            },
            feeToken: {
              address: usdcAddress,
              chainId: baseSepolia.id
            }
          });

          setStatus('Executing quote…');
          const { hash } = await meeClient.executeFusionQuote({ fusionQuote });

          const link = getMeeScanLink(hash);
          setMeeScanLink(link);
          setStatus('Waiting for completion…');

          await meeClient.waitForSupertransactionReceipt({ hash });

          setStatus('Transaction completed!');
        } catch (err: any) {
          console.error(err);
          setStatus(`Error: ${err.message ?? err}`);
        }
      };

      return (
        <main style={{ padding: 40, fontFamily: 'sans-serif', color: 'orangered' }}>
          <h1>Biconomy MEE Quickstart (Base Sepolia)</h1>

          <button
            style={{ padding: '10px 20px', fontSize: '1rem' }}
            onClick={connectAndInit}
            disabled={!!account}
          >
            {account ? `Connected` : 'Connect Wallet'}
          </button>

          {account && (
            <div style={{ marginTop: 20 }}>
              <p><strong>Address:</strong> {account}</p>
              <p>USDC Balance: {balance ? `${formatUnits(balance, 6)} USDC` : '–'}</p>

              <h3>Recipients</h3>
              {recipients.map((recipient, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={recipient}
                  onChange={(e) => {
                    const updated = [...recipients];
                    updated[idx] = e.target.value;
                    setRecipients(updated);
                  }}
                  placeholder="0x..."
                  style={{ display: 'block', margin: '8px 0', padding: '6px', width: '100%' }}
                />
              ))}

              <button onClick={() => setRecipients([...recipients, ''])}>
                Add Recipient
              </button>
            </div>
          )}

          {meeClient && (
            <>
              <p style={{ marginTop: 20 }}>
                <strong>MEE client ready</strong> – you can now orchestrate multichain transactions!
              </p>

              <button
                style={{ padding: '10px 20px', fontSize: '1rem' }}
                onClick={executeTransfers}
              >
                Send 1 USDC to each recipient
              </button>
            </>
          )}

          {status && <p style={{ marginTop: 20 }}>{status}</p>}

          {meeScanLink && (
            <p style={{ marginTop: 10 }}>
              <a href={meeScanLink} target='_blank' rel='noopener noreferrer'>
                View on MEE Scan
              </a>
            </p>
          )}
        </main>
      );
    }
    ```
  </Tab>

  <Tab title="main.tsx">
    ```tsx  theme={null}
    import ReactDOM from 'react-dom/client';
    import { WagmiProvider } from 'wagmi';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { config } from './wagmi';
    import App from './App';

    const queryClient = new QueryClient();

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    );
    ```
  </Tab>
</Tabs>

<Note>
  Ready to publish this to the official docs or format it as a starter repository!
</Note>

# MEE + Fusion (External Wallets)

External wallets, such as MetaMask or Rabby, do not permit direct installation of smart account logic on EOAs. To enable MEE orchestration in this case, **Fusion Mode** is used. It relies on a passthrough mechanism involving a Companion smart account and a signed **trigger transaction**.

<img style={{ height: 400 }} src="https://i.imgur.com/G5EvlNe.png" />

<Note>
  We recommend understanding Fusion Execution before executing code, but if you'd like to skip the theory - [read the code guide](/new/getting-started/pay-gas-erc20-token#-2-fusion-mode-used-with-external-wallets)
</Note>

## Fusion Mode Flow

<Steps>
  <Step title="Trigger Signature">
    The user signs a *trigger transaction* that includes the hash of all orchestration instructions. This signature authorizes the full orchestration with a single user action.
  </Step>

  <Step title="Funds Transferred to Companion Account">
    Funds are temporarily pulled into a *Companion Account* fully owned by the user. This account is non-custodial and stateless—no funds are stored there beyond execution.
  </Step>

  <Step title="Instruction Execution">
    All instructions (e.g., swaps, bridges, multicalls) are executed using the Companion Account.
  </Step>

  <Step title="Return to EOA">
    Resulting assets are sent back to the user's EOA. The Companion Account is left clean with no dust.
  </Step>

  <Step title="Optional Cleanup">
    If an orchestration step fails—especially in multichain setups—a cleanup can revert intermediate steps, returning funds or rebalancing tokens.
  </Step>
</Steps>

Fusion Mode allows orchestrated execution even without embedded wallet features, enabling advanced UX with any external wallet.

## Trigger Types

There are two kinds of Fusion triggers. They depend on which type of token you are using as the input token.

If you're working with tokens which support `ERC20Permit` then you can use the `ERC20Permit` trigger type, which makes the entire orchestration gasless. Otherwise, you must use the `Onchain Tx` trigger, which requires a bit of gas on source chain to execute the `approve` ERC20 transaction.

<Table>
  <thead>
    <tr>
      <th>Trigger Type</th>
      <th>How it Works</th>
      <th>Gas Required</th>
      <th>Token Support</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>**ERC20Permit**</td>
      <td>Uses ERC-2612 signature to permit spending. Orchestration hash is packed into the `deadline` field.</td>
      <td>No</td>
      <td>Only ERC-2612 tokens</td>
    </tr>

    <tr>
      <td>**Onchain Tx**</td>
      <td>Any EVM transaction that includes orchestration instructions. Most often an `approve()` call.</td>
      <td>Yes</td>
      <td>All token types</td>
    </tr>
  </tbody>
</Table>

The SDK will detect whether a token supports ERC-2612 and choose the appropriate trigger type.

## Fusion Constraints

* Can **only consume one token per user signature**.
* Token used for execution must also be used to pay for gas.
* **Transaction sponsorship** is possible and bypasses the gas requirement.

## Fusion Flow

1. **Trigger**: User signs a transaction (e.g. `approve`) that signals orchestration.
2. **Orchestrate**: MEE nodes execute function calls, bridges, or other logic.
3. **Return**: Final steps return assets to the user's EOA.

<Info>
  **Stateless UX**: Users never need to know about the orchestrator account. All resulting tokens return to the user's EOA automatically.
</Info>
