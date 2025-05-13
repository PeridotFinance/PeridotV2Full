# WalletConnect Integration Setup

This project uses WalletConnect for wallet connections. Follow these steps to set up WalletConnect in your local environment.

## Getting a Project ID

1. Create an account at [Reown Cloud](https://cloud.reown.com/)
2. Create a new project
3. Copy your project ID

## Configuration

1. Create a `.env.local` file in the root of the project (if it doesn't exist already)
2. Add the following environment variable:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_from_reown_cloud
```

3. Restart your development server

## Usage

The WalletConnect integration is available in the Connect Wallet button. When users click on WalletConnect, they'll see a QR code that they can scan with their mobile wallet to establish a connection.

## Supported Features

- Connect to multiple blockchain networks
- Sign transactions
- Support for multiple wallet providers that implement WalletConnect
- Responsive connection dialog

## Technical Implementation

The integration uses the following packages:
- `@reown/walletkit`: Core SDK for WalletConnect implementation
- `@walletconnect/utils`: Utilities for WalletConnect
- `@walletconnect/core`: Core functionality for WalletConnect

For more details on how the implementation works, refer to the following files:
- `components/wallet/wallet-provider.tsx`: Main provider that handles WalletConnect sessions
- `components/wallet/connect-wallet-button.tsx`: UI for connecting wallets 



# Installation

AppKit has support for [Wagmi](https://wagmi.sh/) and [Ethers v6](https://docs.ethers.org/v6/) on Ethereum, [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) on Solana and Bitcoin.
Choose one of these to get started.

<Note>
  These steps are specific to [Next.js](https://nextjs.org/) app router. For
  other React frameworks read the [React
  documentation](../../react/core/installation).
</Note>

## Installation

**If you prefer referring to a video tutorial for this, please [click here](#video-tutorial).**

### Set up Reown AppKit using AI

If you're using Cursor IDE (or another AI based IDE) to build a project with Reown AppKit, Reown provides a `.mdc` file that enhances your development experience. The `reown-appkit.mdc` [file here](https://github.com/reown-com/reown-docs/blob/main/reown-appkit.mdc) contains Cursor-specific rules and type hints for Reown AppKit.

To use it in your project:

1. Copy the `reown-appkit.mdc` file from this repository
2. Create a `.cursor/rules` folder in your project's root directory (if it doesn't exist)
3. Place the `.mdc` file in your project's `.cursor/rules` folder

For more info, refer to [Cursor's documentation](https://docs.cursor.com/context/rules#project-rules).

### AppKit CLI

Reown offers a dedicated CLI to set up a minimal version of AppKit in the easiest and quickest way possible.

To do this, please run the command below.

```bash
npx @reown/appkit-cli
```

After running the command, you will be prompted to confirm the installation of the CLI. Upon your confirmation, the CLI will request the following details:

1. **Project Name**: Enter the name for your project.
2. **Framework**: Select your preferred framework or library. Currently, you have three options: React, Next.js, and Vue.
3. **Network-Specific libraries**: Choose whether you want to install Wagmi, Ethers, Solana, or Multichain (EVM + Solana).

After providing the project name and selecting your preferences, the CLI will install a minimal example of AppKit with your preferred blockchain library. The example will be pre-configured with a `projectId` that will only work on `localhost`.

To fully configure your project, please obtain a `projectId` from the Reown Cloud Dashboard and update your project accordingly.

**Refer to [this section](#cloud-configuration) for more information.**

### Custom Installation

<Tabs>
  <Tab title="Wagmi">
    <CodeGroup>
      ```bash npm
      npm install @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
      ```

      ```bash Yarn
      yarn add @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
      ```

      ```bash Bun
      bun add @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
      ```

      ```bash pnpm
      pnpm add @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Ethers v5">
    <CodeGroup>
      ```bash npm
      npm install @reown/appkit @reown/appkit-adapter-ethers5 ethers@5.7.2
      ```

      ```bash Yarn
      yarn add @reown/appkit @reown/appkit-adapter-ethers5 ethers@5.7.2
      ```

      ```bash Bun
      bun add @reown/appkit @reown/appkit-adapter-ethers5 ethers@5.7.2
      ```

      ```bash pnpm
      pnpm add @reown/appkit @reown/appkit-adapter-ethers5 ethers@5.7.2
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Ethers">
    <CodeGroup>
      ```bash npm
      npm install @reown/appkit @reown/appkit-adapter-ethers ethers
      ```

      ```bash Yarn
      yarn add @reown/appkit @reown/appkit-adapter-ethers ethers
      ```

      ```bash Bun
      bun add @reown/appkit @reown/appkit-adapter-ethers ethers
      ```

      ```bash pnpm
      pnpm add @reown/appkit @reown/appkit-adapter-ethers ethers
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Solana">
    <CodeGroup>
      ```bash npm
      npm install @reown/appkit @reown/appkit-adapter-solana @solana/wallet-adapter-wallets
      ```

      ```bash Yarn
      yarn add @reown/appkit @reown/appkit-adapter-solana @solana/wallet-adapter-wallets
      ```

      ```bash Bun
      bun add @reown/appkit @reown/appkit-adapter-solana @solana/wallet-adapter-wallets
      ```

      ```bash pnpm
      pnpm add @reown/appkit @reown/appkit-adapter-solana @solana/wallet-adapter-wallets
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Bitcoin">
    <CodeGroup>
      ```bash npm
      npm install @reown/appkit @reown/appkit-adapter-bitcoin
      ```

      ```bash Yarn
      yarn add @reown/appkit @reown/appkit-adapter-bitcoin
      ```

      ```bash Bun
      bun add @reown/appkit @reown/appkit-adapter-bitcoin
      ```

      ```bash pnpm
      pnpm add @reown/appkit @reown/appkit-adapter-bitcoin
      ```
    </CodeGroup>
  </Tab>
</Tabs>

## Cloud Configuration

Create a new project on Reown Cloud at [https://cloud.reown.com](https://cloud.reown.com) and obtain a new project ID.

<Info>
  **Don't have a project ID?**

  Head over to Reown Cloud and create a new project now!

  <Card title="Get started" href="https://cloud.reown.com/?utm_source=cloud_banner&utm_medium=docs&utm_campaign=backlinks" />
</Info>

## Implementation

<Tabs>
  <Tab title="Wagmi">
    <Card title="wagmi Example" icon="github" href="https://github.com/reown-com/appkit-web-examples/tree/main/nextjs/next-wagmi-app-router">
      Check the Next wagmi example
    </Card>

    For a quick integration, you can use the `createAppKit` function with a unified configuration. This automatically applies the predefined configurations for different adapters like Wagmi, Ethers, or Solana, so you no longer need to manually configure each one individually. Simply pass the common parameters such as projectId, chains, metadata, etc., and the function will handle the adapter-specific configurations under the hood.

    This includes WalletConnect, Coinbase and Injected connectors, and the [Blockchain API](../../../../cloud/blockchain-api) as a [transport](https://wagmi.sh/core/api/createConfig#transports)

    ### Wagmi config

    Create a new file for your Wagmi configuration, since we are going to be calling this function on the client and the server it cannot live inside a file with the 'use client' directive.

    For this example we will create a file called `config/index.tsx` outside our app directory and set up the following configuration

    ```tsx
    import { cookieStorage, createStorage, http } from '@wagmi/core'
    import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
    import { mainnet, arbitrum } from '@reown/appkit/networks'

    // Get projectId from https://cloud.reown.com
    export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID

    if (!projectId) {
      throw new Error('Project ID is not defined')
    }

    export const networks = [mainnet, arbitrum]

    //Set up the Wagmi Adapter (Config)
    export const wagmiAdapter = new WagmiAdapter({
      storage: createStorage({
        storage: cookieStorage
      }),
      ssr: true,
      projectId,
      networks
    })

    export const config = wagmiAdapter.wagmiConfig
    ```

    ## Importing networks

    Reown AppKit use [Viem](https://viem.sh/) networks under the hood, which provide a wide variety of networks for EVM chains. You can find all the networks supported by Viem within the `@reown/appkit/networks` path.

    ```js {2}
    import { createAppKit } from '@reown/appkit'
    import { mainnet, arbitrum, base, scroll, polygon } from '@reown/appkit/networks'
    ```

    <Note>
      Looking to add a custom network? Check out the [custom networks](../../core/custom-networks) section.
    </Note>

    ## SSR and Hydration

    :::info

    * Using cookies is completely optional and by default Wagmi will use `localStorage` instead if the `storage` param is not defined.
    * The `ssr` flag will delay the hydration of Wagmi's store to avoid hydration mismatch errors.
    * AppKit doesn't fully support the `ssr` flag.
      :::

    <br />

    ### Context Provider

    Let's create now a context provider that will wrap our application and initialized AppKit (`createAppKit` needs to be called inside a Next Client Component file).

    In this example we will create a file called `context/index.tsx` outside our app directory and set up the following configuration

    ```tsx
    'use client'

    import { wagmiAdapter, projectId } from '@/config'
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
    import { createAppKit } from '@reown/appkit/react'
    import { mainnet, arbitrum } from '@reown/appkit/networks'
    import React, { type ReactNode } from 'react'
    import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'

    // Set up queryClient
    const queryClient = new QueryClient()

    if (!projectId) {
      throw new Error('Project ID is not defined')
    }

    // Set up metadata
    const metadata = {
      name: 'appkit-example',
      description: 'AppKit Example',
      url: 'https://appkitexampleapp.com', // origin must match your domain & subdomain
      icons: ['https://avatars.githubusercontent.com/u/179229932']
    }

    // Create the modal
    const modal = createAppKit({
      adapters: [wagmiAdapter],
      projectId,
      networks: [mainnet, arbitrum],
      defaultNetwork: mainnet,
      metadata: metadata,
      features: {
        analytics: true // Optional - defaults to your Cloud configuration
      }
    })

    function ContextProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
      const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies)

      return (
        <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
      )
    }

    export default ContextProvider
    ```

    ### Layout

    Next, in our `app/layout.tsx` file, we will import our `ContextProvider` component and call [the Wagmi's function `cookieToInitialState`.](https://wagmi.sh/react/guides/ssr#_2-hydrate-the-cookie)

    The `initialState` returned by `cookieToInitialState`, contains the optimistic values that will populate the Wagmi's store both on the server and client.

    ```tsx
    import type { Metadata } from 'next'
    import { Inter } from 'next/font/google'
    import './globals.css'

    const inter = Inter({ subsets: ['latin'] })

    import { headers } from 'next/headers' // added
    import ContextProvider from '@/context'

    export const metadata: Metadata = {
      title: 'AppKit Example App',
      description: 'Powered by Reown'
    }

    export default function RootLayout({
      children
    }: Readonly<{
      children: React.ReactNode
    }>) {

      const headersObj = await headers();
      const cookies = headersObj.get('cookie')

      return (
        <html lang="en">
          <body className={inter.className}>
            <ContextProvider cookies={cookies}>{children}</ContextProvider>
          </body>
        </html>
      )
    }
    ```
  </Tab>

  <Tab title="Ethers v5">
    In this example we will create a new file called `context/appkit.tsx` outside our app directory and set up the following configuration

    ```tsx
    "use client";

    import { createAppKit } from "@reown/appkit/react";
    import { Ethers5Adapter } from "@reown/appkit-adapter-ethers5";
    import { mainnet, arbitrum } from "@reown/appkit/networks";

    // 1. Get projectId at https://cloud.reown.com
    const projectId = "YOUR_PROJECT_ID";

    // 2. Create a metadata object
    const metadata = {
      name: "My Website",
      description: "My Website description",
      url: "https://mywebsite.com", // origin must match your domain & subdomain
      icons: ["https://avatars.mywebsite.com/"],
    };

    // 3. Create the AppKit instance
    createAppKit({
      adapters: [new Ethers5Adapter()],
      metadata: metadata,
      networks: [mainnet, arbitrum],
      projectId,
      features: {
        analytics: true, // Optional - defaults to your Cloud configuration
      },
    });

    export function AppKit() {
      return (
        <YourApp /> //make sure you have configured the <appkit-button> inside
      );
    }
    ```

    Next, in your `app/layout.tsx` or `app/layout.jsx` file, import the custom AppKit component.

    ```tsx
    import "./globals.css";

    import { AppKit } from "../context/appkit";

    export const metadata = {
      title: "AppKit",
      description: "AppKit Example",
    };

    export default function RootLayout({ children }) {
      return (
        <html lang="en">
          <body>
            <AppKit>{children}</AppKit>
          </body>
        </html>
      );
    }
    ```

    <Warning>
      Make sure that the `url` from the `metadata` matches your domain and subdomain. This will later be used by the [Verify API](../../../cloud/verify) to tell wallets if your application has been verified or not.
    </Warning>
  </Tab>

  <Tab title="Ethers">
    <Card title="ethers Example" icon="github" href="https://github.com/reown-com/appkit-web-examples/tree/main/nextjs/next-ethers-app-router">
      Check the Next ethers example
    </Card>

    In this example we will create a new file called `context/appkit.tsx` outside our app directory and set up the following configuration

    ```tsx
    "use client";

    import { createAppKit } from "@reown/appkit/react";
    import { EthersAdapter } from "@reown/appkit-adapter-ethers";
    import { mainnet, arbitrum } from "@reown/appkit/networks";

    // 1. Get projectId at https://cloud.reown.com
    const projectId = "YOUR_PROJECT_ID";

    // 2. Create a metadata object
    const metadata = {
      name: "My Website",
      description: "My Website description",
      url: "https://mywebsite.com", // origin must match your domain & subdomain
      icons: ["https://avatars.mywebsite.com/"],
    };

    // 3. Create the AppKit instance
    createAppKit({
      adapters: [new EthersAdapter()],
      metadata,
      networks: [mainnet, arbitrum],
      projectId,
      features: {
        analytics: true, // Optional - defaults to your Cloud configuration
      },
    });

    export function AppKit() {
      return (
        <YourApp /> //make sure you have configured the <appkit-button> inside
      );
    }
    ```

    Next, in your `app/layout.tsx` or `app/layout.jsx` file, import the custom AppKit component.

    ```tsx
    import "./globals.css";

    import { AppKit } from "../context/appkit";

    export const metadata = {
      title: "AppKit",
      description: "AppKit Example",
    };

    export default function RootLayout({ children }) {
      return (
        <html lang="en">
          <body>
            <AppKit>{children}</AppKit>
          </body>
        </html>
      );
    }
    ```

    <Warning>
      Make sure that the `url` from the `metadata` matches your domain and subdomain. This will later be used by the [Verify API](../../../../cloud/verify) to tell wallets if your application has been verified or not.
    </Warning>
  </Tab>

  <Tab title="Solana">
    <Card title="Solana Example" icon="github" href="https://github.com/reown-com/appkit-web-examples/tree/main/nextjs/next-solana-app-router">
      Check the Next Solana example
    </Card>

    AppKit Solana provides a set of React components and hooks to easily connect Solana wallets with your application.

    On top of your app set up the following configuration, making sure that all functions are called outside any React component to avoid unwanted rerenders.

    ```tsx
    // App.tsx
    import { createAppKit } from "@reown/appkit/react";
    import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
    import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";
    import {
      PhantomWalletAdapter,
      SolflareWalletAdapter,
    } from "@solana/wallet-adapter-wallets";

    // 0. Set up Solana Adapter
    const solanaWeb3JsAdapter = new SolanaAdapter({
      wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    });

    // 1. Get projectId from https://cloud.reown.com
    const projectId = "YOUR_PROJECT_ID";

    // 2. Create a metadata object - optional
    const metadata = {
      name: "AppKit",
      description: "AppKit Solana Example",
      url: "https://example.com", // origin must match your domain & subdomain
      icons: ["https://avatars.githubusercontent.com/u/179229932"],
    };

    // 3. Create modal
    createAppKit({
      adapters: [solanaWeb3JsAdapter],
      networks: [solana, solanaTestnet, solanaDevnet],
      metadata: metadata,
      projectId,
      features: {
        analytics: true, // Optional - defaults to your Cloud configuration
      },
    });

    export default function App() {
      return <YourApp />;
    }
    ```
  </Tab>

  <Tab title="Bitcoin">
    <Card title="Bitcoin Example" icon="github" href="https://github.com/reown-com/appkit-web-examples/tree/main/nextjs/next-bitcoin-app-router">
      Check the Next Bitcoin example
    </Card>

    AppKit Bitcoin provides a set of React components and hooks to easily connect Bitcoin wallets with your application.

    On top of your app set up the following configuration, making sure that all functions are called outside any React component to avoid unwanted rerenders.

    ```tsx
    // App.tsx
    import { createAppKit } from '@reown/appkit/react'
    import { BitcoinAdapter } from '@reown/appkit-adapter-bitcoin'
    import { bitcoin  } from '@reown/appkit/networks'

    // 1. Get projectId from https://cloud.reown.com
    const projectId = 'YOUR_PROJECT_ID'

    // 2. Set the networks
    const networks = [bitcoin]

    // 3. Set up Bitcoin Adapter
    const bitcoinAdapter = new BitcoinAdapter({
      projectId
    })

    // 4. Create a metadata object - optional
    const metadata = {
      name: 'AppKit',
      description: 'AppKit Bitcoin Example',
      url: 'https://example.com', // origin must match your domain & subdomain
      icons: ['https://avatars.githubusercontent.com/u/179229932']
    }

    // 5. Create modal
    createAppKit({
      adapters: [bitcoinAdapter],
      networks,
      metadata,
      projectId,
      features: {
        analytics: true // Optional - defaults to your Cloud configuration,
        email: false,
        socials: []
      }
    })

    export default function App() {
      return <YourApp />
    }
    ```

    ## Bitcoin Provider Interface

    ```ts
    export interface BitcoinConnector extends ChainAdapterConnector, Provider {
      getAccountAddresses(): Promise<BitcoinConnector.AccountAddress[]>;
      signMessage(params: BitcoinConnector.SignMessageParams): Promise<string>;
      sendTransfer(params: BitcoinConnector.SendTransferParams): Promise<string>;
      signPSBT(
        params: BitcoinConnector.SignPSBTParams
      ): Promise<BitcoinConnector.SignPSBTResponse>;
    }
    ```

    ### Parameters

    <Tabs>
      <Tab title="SignMessageParams">
        ```ts
          export type SignMessageParams = {
            /**
             * The message to be signed
             */
            message: string
            /**
             * The address to sign the message with
             */
            address: string
          }
        ```
      </Tab>

      <Tab title="SignMessageParams">
        ```ts
          export type SendTransferParams = {
            /**
             * The amount to be sent in satoshis
             */
            amount: string
            /**
             * The address to send the transfer to
             */
            recipient: string
          }
        ```
      </Tab>

      <Tab title="SignPSBTParams">
        ```ts
          export type SignPSBTParams = {
            /**
             * The PSBT to be signed, string base64 encoded
             */
            psbt: string
            signInputs: {
              /**
               * The address whose private key to use for signing.
               */
              address: string
              /**
               * Specifies which input to sign
               */
              index: number
              /**
               * Specifies which part(s) of the transaction the signature commits to
               */
              sighashTypes: number[]
            }[]

            /**
             * If `true`, the PSBT will be broadcasted after signing. Default is `false`.
             */
            broadcast?: boolean

        }

        ```
      </Tab>
    </Tabs>

    ### Responses

    <Tabs>
      <Tab title="AccountAddress">
        ```ts
          export type AccountAddress = {
            /**
             * Public address belonging to the account.
             */
            address: string
            /**
             * Public key for the derivation path in hex, without 0x prefix
             */
            publicKey?: string
            /**
             * The derivation path of the address e.g. "m/84'/0'/0'/0/0"
             */
            path?: string
            /**
             * The purpose of the address
             */
            purpose: 'payment' | 'ordinal' | 'stx'
          }
        ```
      </Tab>

      <Tab title="SignPSBTResponse">
        ```ts
          export type SignPSBTResponse = {
            /**
             * The signed PSBT, string base64 encoded
             */
            psbt: string
            /**
             * The `string` transaction id of the broadcasted transaction or `undefined` if not broadcasted
             */
            txid?: string
          }
        ```
      </Tab>
    </Tabs>
  </Tab>
</Tabs>

## Trigger the modal

<Tabs>
  <Tab title="Wagmi">
    To open AppKit you can use our [**web component**](../../core/components) or build your own button with AppKit [**hooks**](../../core/hooks.mdx#useAppKit).
    In this example we are going to use the `<appkit-button>` component.

    Web components are global html elements that don't require importing.

    ```tsx
    export default function ConnectButton() {
      return <appkit-button />
    }
    ```

    Learn more about the AppKit web components [here](../../core/components)
  </Tab>

  <Tab title="Ethers v5">
    To open AppKit you can use our [**web component**](../core/components) or build your own button with AppKit [**hooks**](../core/hooks.mdx#useAppKit).

    <Tabs>
      <Tab title="Web Component">
        ```tsx
        export default function ConnectButton() {
          return <appkit-button />;
        }
        ```

        Learn more about the AppKit web components [here](../core/components)

        <Info>
          Web components are global html elements that don't require importing.
        </Info>
      </Tab>

      <Tab title="Hooks">
        You can trigger the modal by calling the `open` function from `useAppKit` hook.

        ```tsx
        import { useAppKit } from "@reown/appkit/react";

        export default function ConnectButton() {
          // 4. Use modal hook
          const { open } = useAppKit();

          return (
            <>
              <button onClick={() => open()}>Open Connect Modal</button>
              <button onClick={() => open({ view: "Networks" })}>
                Open Network Modal
              </button>
            </>
          );
        }
        ```

        Learn more about the AppKit hooks [here](../core/hooks)
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Ethers">
    To open AppKit you can use our [**web component**](../../core/components) or build your own button with AppKit [**hooks**](../../core/hooks.mdx#useAppKit).

    <Tabs>
      <Tab title="Web Component">
        ```tsx
        export default function ConnectButton() {
          return <appkit-button />;
        }
        ```

        Learn more about the AppKit web components [here](../../core/components)

        <Info>
          Web components are global html elements that don't require importing.
        </Info>
      </Tab>

      <Tab title="Hooks">
        You can trigger the modal by calling the `open` function from `useAppKit` hook.

        ```tsx
        import { useAppKit } from "@reown/appkit/react";

        export default function ConnectButton() {
          // 4. Use modal hook
          const { open } = useAppKit();

          return (
            <>
              <button onClick={() => open()}>Open Connect Modal</button>
              <button onClick={() => open({ view: "Networks" })}>
                Open Network Modal
              </button>
            </>
          );
        }
        ```

        Learn more about the AppKit hooks [here](../../core/hooks)
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Solana">
    To open AppKit you can use our default web components or build your own logic using AppKit hooks.

    <Tabs>
      <Tab title="Components">
        ```tsx
        export default function ConnectButton() {
          return <appkit-button />;
        }
        ```

        Learn more about the AppKit web components [here](../../core/components)

        <Info>
          Web components are global html elements that don't require importing.
        </Info>
      </Tab>

      <Tab title="Hooks">
        You can trigger the modal by calling the `open` function from `useAppKit` hook.

        ```tsx
        import { useAppKit } from "@reown/appkit/react";

        export default function ConnectButton() {
          // 4. Use modal hook
          const { open } = useAppKit();

          return (
            <>
              <button onClick={() => open()}>Open Connect Modal</button>
              <button onClick={() => open({ view: "Networks" })}>
                Open Network Modal
              </button>
            </>
          );
        }
        ```

        Learn more about the AppKit hooks [here](../../core/hooks)
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Bitcoin">
    To open AppKit you can use our default [web components](../../core/components) or build your own logic using [AppKit hooks](../../core/hooks).
    In this example we are going to use the `<appkit-button>` component.

    Web components are global html elements that don't require importing.

    ```tsx
    export default function ConnectButton() {
      return <appkit-button />
    }
    ```
  </Tab>
</Tabs>

## Smart Contract Interaction

<Tabs>
  <Tab title="Wagmi">
    [Wagmi hooks](https://wagmi.sh/react/api/hooks/useReadContract) can help us interact with wallets and smart contracts:

    ```tsx
    import { useReadContract } from "wagmi";
    import { USDTAbi } from "../abi/USDTAbi";

    const USDTAddress = "0x...";

    function App() {
      const result = useReadContract({
        abi: USDTAbi,
        address: USDTAddress,
        functionName: "totalSupply",
      });
    }
    ```

    Read more about Wagmi hooks for smart contract interaction [here](https://wagmi.sh/react/hooks/useReadContract).
  </Tab>

  <Tab title="Ethers">
    [Ethers](https://docs.ethers.org/v6/) can help us interact with wallets and smart contracts:

    ```tsx
    import { useAppKitProvider, useAppKitAccount } from "@reown/appkit/react";
    import { BrowserProvider, Contract, formatUnits } from "ethers";

    const USDTAddress = "0x617f3112bf5397D0467D315cC709EF968D9ba546";

    // The ERC-20 Contract ABI, which is a common contract interface
    // for tokens (this is the Human-Readable ABI format)
    const USDTAbi = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function balanceOf(address) view returns (uint)",
      "function transfer(address to, uint amount)",
      "event Transfer(address indexed from, address indexed to, uint amount)",
    ];

    function Components() {
      const { address, caipAddress, isConnected } = useAppKitAccount();
      const { walletProvider } = useAppKitProvider("eip155");

      async function getBalance() {
        if (!isConnected) throw Error("User disconnected");

        const ethersProvider = new BrowserProvider(walletProvider);
        const signer = await ethersProvider.getSigner();
        // The Contract object
        const USDTContract = new Contract(USDTAddress, USDTAbi, signer);
        const USDTBalance = await USDTContract.balanceOf(address);

        console.log(formatUnits(USDTBalance, 18));
      }

      return <button onClick={getBalance}>Get User Balance</button>;
    }
    ```
  </Tab>

  <Tab title="Solana">
    [@Solana/web3.js](https://solana.com/docs/clients/javascript) library allows for seamless interaction with wallets and smart contracts on the Solana blockchain.

    For a practical example of how it works, you can refer to our [lab dApp](https://appkit-lab.reown.com/library/solana/).

    ```tsx
    import {
      SystemProgram,
      PublicKey,
      Keypair,
      Transaction,
      TransactionInstruction,
      LAMPORTS_PER_SOL
    } from '@solana/web3.js'
    import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
    import { useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react'

    function deserializeCounterAccount(data?: Buffer): { count: number } {
      if (data?.byteLength !== 8) {
        throw Error('Need exactly 8 bytes to deserialize counter')
      }

      return {
        count: Number(data[0])
      }
    }

    const { address } = useAppKitAccount()
    const { connection } = useAppKitConnection()
    const { walletProvider } = useAppKitProvider<Provider>('solana')

    async function onIncrementCounter() {
      const PROGRAM_ID = new PublicKey('Cb5aXEgXptKqHHWLifvXu5BeAuVLjojQ5ypq6CfQj1hy')

      const counterKeypair = Keypair.generate()
      const counter = counterKeypair.publicKey

      const balance = await connection.getBalance(walletProvider.publicKey)
      if (balance < LAMPORTS_PER_SOL / 100) {
        throw Error('Not enough SOL in wallet')
      }

      const COUNTER_ACCOUNT_SIZE = 8
      const allocIx: TransactionInstruction = SystemProgram.createAccount({
        fromPubkey: walletProvider.publicKey,
        newAccountPubkey: counter,
        lamports: await connection.getMinimumBalanceForRentExemption(COUNTER_ACCOUNT_SIZE),
        space: COUNTER_ACCOUNT_SIZE,
        programId: PROGRAM_ID
      })

      const incrementIx: TransactionInstruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          {
            pubkey: counter,
            isSigner: false,
            isWritable: true
          }
        ],
        data: Buffer.from([0x0])
      })

      const tx = new Transaction().add(allocIx).add(incrementIx)

      tx.feePayer = walletProvider.publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash

      await walletProvider.signAndSendTransaction(tx, [counterKeypair])

      const counterAccountInfo = await connection.getAccountInfo(counter, {
        commitment: 'confirmed'
      })

      if (!counterAccountInfo) {
        throw new Error('Expected counter account to have been created')
      }

      const counterAccount = deserializeCounterAccount(counterAccountInfo?.data)

      if (counterAccount.count !== 1) {
        throw new Error('Expected count to have been 1')
      }

      console.log(`[alloc+increment] count is: ${counterAccount.count}`);
    }
    ```
  </Tab>
</Tabs>

## Extra configuration

Next.js relies on [SSR](https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering). This means some specific steps are required to make AppKit work properly.

* Add the following code in the `next.config.js` file

```ts
// Path: next.config.js
const nextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
```

* [Learn more about SSR with Wagmi](https://wagmi.sh/react/guides/ssr)

## Video Tutorial

<iframe width="560" height="315" src="https://www.youtube.com/embed/lxTGqXh7LiA?si=rxEaMIEYK7vdW_vt" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen />


Usage

Copy page

This section provides instructions on how to initialize the WalletKit client, approve sessions with supported namespaces, and respond to session requests, enabling easy integration of Web3 wallets with dapps through a simple and intuitive interface.

​
Cloud Configuration
Create a new project on Reown Cloud at https://cloud.reown.com and obtain a new project ID.

Don’t have a project ID?

Head over to Reown Cloud and create a new project now!

Get started
​
Initialization
Create a new instance from Core and initialize it with a projectId created from installation. Next, create WalletKit instance by calling init on walletKit. Passing in the options object containing metadata about the app and an optional relay URL.

Make sure you initialize walletKit globally and use the same instance for all your sessions. For React-based apps, you can initialize it in the root component and export it to use in other components.


Copy
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";

const core = new Core({
  projectId: process.env.PROJECT_ID,
});

const walletKit = await WalletKit.init({
  core, // <- pass the shared `core` instance
  metadata: {
    name: "Demo app",
    description: "Demo Client as Wallet/Peer",
    url: "https://reown.com/walletkit",
    icons: [],
  },
});
​
Session
A session is a connection between a dapp and a wallet. It is established when a user approves a session proposal from a dapp. A session is active until the user disconnects from the dapp or the session expires.

​
Namespace Builder
With WalletKit (and @walletconnect/utils) we’ve published a helper utility that greatly reduces the complexity of parsing the required and optional namespaces. It accepts as parameters a session proposal along with your user’s chains/methods/events/accounts and returns ready-to-use namespaces object.


Copy
// util params
{
  proposal: ProposalTypes.Struct; // the proposal received by `.on("session_proposal")`
  supportedNamespaces: Record< // your Wallet's supported namespaces
    string, // the supported namespace key e.g. eip155
    {
      chains: string[]; // your supported chains in CAIP-2 format e.g. ["eip155:1", "eip155:2", ...]
      methods: string[]; // your supported methods e.g. ["personal_sign", "eth_sendTransaction"]
      events: string[]; // your supported events e.g. ["chainChanged", "accountsChanged"]
      accounts: string[] // your user's accounts in CAIP-10 format e.g. ["eip155:1:0x453d506b1543dcA64f57Ce6e7Bb048466e85e228"]
      }
  >;
};
Example usage


Copy
// import the builder util
import { WalletKit, WalletKitTypes } from '@reown/walletkit'
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils'

async function onSessionProposal({ id, params }: WalletKitTypes.SessionProposal){
  try{
    // ------- namespaces builder util ------------ //
    const approvedNamespaces = buildApprovedNamespaces({
      proposal: params,
      supportedNamespaces: {
        eip155: {
          chains: ['eip155:1', 'eip155:137'],
          methods: ['eth_sendTransaction', 'personal_sign'],
          events: ['accountsChanged', 'chainChanged'],
          accounts: [
            'eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb',
            'eip155:137:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb'
          ]
        }
      }
    })
    // ------- end namespaces builder util ------------ //

    const session = await walletKit.approveSession({
      id,
      namespaces: approvedNamespaces
    })
  }catch(error){
    // use the error.message to show toast/info-box letting the user know that the connection attempt was unsuccessful
    ....
    await walletKit.rejectSession({
      id: proposal.id,
      reason: getSdkError("USER_REJECTED")
    })
  }
}


walletKit.on('session_proposal', onSessionProposal)
If your wallet supports multiple namespaces e.g. eip155,cosmos & near Your supportedNamespaces should look like the following example.


Copy
// ------- namespaces builder util ------------ //
const approvedNamespaces = buildApprovedNamespaces({
    proposal: params,
    supportedNamespaces: {
        eip155: {...},
        cosmos: {...},
        near: {...}
    },
});
// ------- end namespaces builder util ------------ //
​
Get Active Sessions
You can get the wallet active sessions using the getActiveSessions function.


Copy
const activeSessions = walletKit.getActiveSessions();
​
EVM methods & events
In @walletconnect/ethereum-provider, (our abstracted EVM SDK for apps) we support by default the following Ethereum methods and events:


Copy
{
  //...
  methods: [
    "eth_accounts",
    "eth_requestAccounts",
    "eth_sendRawTransaction",
    "eth_sign",
    "eth_signTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_sendTransaction",
    "personal_sign",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_getPermissions",
    "wallet_requestPermissions",
    "wallet_registerOnboarding",
    "wallet_watchAsset",
    "wallet_scanQRCode",
    "wallet_sendCalls",
    "wallet_getCallsStatus",
    "wallet_showCallsStatus",
    "wallet_getCapabilities",
  ],
  events: [
    "chainChanged",
    "accountsChanged",
    "message",
    "disconnect",
    "connect",
  ]
}
​
Session Approval
The session_proposal event is emitted when a dapp initiates a new session with a user’s wallet. The event will include a proposal object with information about the dapp and requested permissions. The wallet should display a prompt for the user to approve or reject the session. If approved, call approveSession and pass in the proposal.id and requested namespaces.

The pair method initiates a WalletConnect pairing process with a dapp using the given uri (QR code from the dapps). To learn more about pairing, checkout out the docs.


Copy
walletKit.on(
  "session_proposal",
  async (proposal: WalletKitTypes.SessionProposal) => {
    const session = await walletKit.approveSession({
      id: proposal.id,
      namespaces,
    });
  }
);
await walletKit.pair({ uri });
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
No matching key. proposal id doesn't exist: 1
This rejection means the SDK can’t find a record with the given proposal.id - in this example 1. This can happen when the proposal has expired (by default 5 minutes) or if you attempt to respond to a proposal that has already been approved/rejected. If you are seeing this error, please make sure that you are calling approveSession with the correct proposal.id that is available within the proposal payload.

Error: Missing or invalid. approve(), namespaces should be an object with data
This error means that the namespaces parameter passed to approveSession is either missing or invalid. Please check that you are passing a valid namespaces object that satisfies all required properties.

Non conforming namespaces. approve() namespaces <property> don't satisfy required namespaces.
This error indicates that some value(s) in your namespaces object do not satisfy the required namespaces requested by the dapp. To provide additional guidance, the message might include info about the exact property that is missing or invalid e.g. Required: eip155:1 Approved: eip155:137. Please check CAIP-25 to familiarize yourself with the standard and it’s nuances. Additionally, we highly recommend you to use our namespace builder utility that would greatly simplify the process of parsing & building a valid namespaces object.

​
Session Rejection
In the event you want to reject the session proposal, call the rejectSession method. The getSDKError function comes from the @walletconnect/utils library.


Copy
walletKit.on(
  "session_proposal",
  async (proposal: WalletKitTypes.SessionProposal) => {
    await walletKit.rejectSession({
      id: proposal.id,
      reason: getSdkError("USER_REJECTED_METHODS"),
    });
  }
);
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
No matching key. proposal id doesn't exist: 1
This rejection means the SDK can’t find a record with the given proposal.id - in this example 1. This can happen when the proposal has expired (by default 5 minutes) or if you attempt to respond to a proposal that has already been approved/rejected. If you are seeing this error, please make sure that you are calling rejectSession with the correct proposal.id that is available within the proposal payload.

Error: Missing or invalid. reject() reason:
This rejection means the reason parameter passed to rejectSession is either missing or invalid. We recommend using the getSDKError function from the @walletconnect/utils library that will populate & format the parameter for you.

​
Responding to Session requests
The session_request event is emitted when the SDK received a request from the peer and it needs the wallet to perform a specific action, such as signing a transaction. The event contains a topic and a request object, which will vary depending on the action requested.

To respond to the request, you can access the topic and request object by destructuring them from the event payload. To see a list of possible request and response objects, refer to the relevant JSON-RPC Methods for Ethereum, Solana, Cosmos, or Stellar.

As an example, if the dapp requests a personal_sign method, you can extract the params array from the request object. The first item in the array is the hex version of the message to be signed, which can be converted to UTF-8 and assigned to a message variable. The second item in params is the user’s wallet address.

To sign the message, you can use your wallet’s signMessage method and pass in the message. The signed message, along with the id from the event payload, can then be used to create a response object, which can be passed into respondSessionRequest.


Copy
walletKit.on(
  "session_request",
  async (event: WalletKitTypes.SessionRequest) => {
    const { topic, params, id } = event;
    const { request } = params;
    const requestParamsMessage = request.params[0];

    // convert `requestParamsMessage` by using a method like hexToUtf8
    const message = hexToUtf8(requestParamsMessage);

    // sign the message
    const signedMessage = await wallet.signMessage(message);

    const response = { id, result: signedMessage, jsonrpc: "2.0" };

    await walletKit.respondSessionRequest({ topic, response });
  }
);
To reject a session request, the response should be similar to this.


Copy
const response = {
  id,
  jsonrpc: "2.0",
  error: {
    code: 5000,
    message: "User rejected.",
  },
};
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session has been disconnected by either the wallet or the dapp while the session request was being processed or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic that is available within the request payload.

Error: Missing or invalid. respond() response:
This rejection means the response parameter passed to respondSessionRequest is either missing or invalid. The response should be a valid JSON-RPC 2.0 response object. We recommend you to use our formatJsonRpcResult utility from "@walletconnect/jsonrpc-utils" that will format the response for you.

Example usage: id argument being the request id from the request payload.


Copy
import { formatJsonRpcResult } from "@walletconnect/jsonrpc-utils";

const signature = await cryptoWallet.signTransaction(signTransaction);
const response = await walletKit.respondSessionRequest({
  topic: session.topic,
  response: formatJsonRpcResult(id, signature),
});
​
Updating a Session
If you wish to include new accounts or chains or methods in an existing session, updateSession allows you to do so. You need pass in the topic and a new Namespaces object that contains all of the existing namespaces as well as the new data you wish to include. After you update the session, the other peer will receive a session_update event.

An example adding a new account to an existing session:


Copy
const namespaces = session.namespaces;
const accounts = [
  "eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  "eip155:1:0x1234567890123456789012345678901234567890",
];
const updatedNamespaces = {
  ...namespaces,
  eip155: {
    ...namespaces.eip155,
    accounts,
  },
};
const { acknowledged } = await walletKit.updateSession({
  topic: session.topic,
  namespaces: updatedNamespaces,
});
// If you wish to be notified when the dapp acknowledges the update.
// note that if the dapp is offline `acknowledged` will not resolve until it comes back online
await acknowledged();
An example adding a new chain to an existing session:


Copy
const namespaces = session.namespaces;
const chains = ["eip155:1", "eip155:137"];
const accounts = [
  "eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  "eip155:137:0x1234567890123456789012345678901234567890",
];
const updatedNamespaces = {
  ...namespaces,
  eip155: {
    ...namespaces.eip155,
    accounts,
    chains,
  },
};
await walletKit.updateSession({
  topic: session.topic,
  namespaces: updatedNamespaces,
});
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
Note that all namespaces validation applies and you still have to satisfy the required namespaces requested by the dapp.

Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

Error: Missing or invalid. update(), namespaces should be an object with data
This error means that the namespaces parameter passed to updateSession is either missing or invalid. Please check that you are passing a valid namespaces object that satisfies all required properties.

Non conforming namespaces. update() namespaces <property> don't satisfy required namespaces.
This error indicates that some value(s) in your namespaces object do not satisfy the required namespaces requested by the dapp. To provide additional guidance, the message might include info about the exact property that is missing or invalid e.g. Required: eip155:1 Approved: eip155:137. Please check CAIP-25 to familiarize yourself with the standard and it’s nuances. Additionally, we highly recommend you to use our namespace builder utility that would greatly simplify the process of parsing & building a valid namespaces object.

​
Extending a Session
Sessions have a default expiry of 7 days. To extend a session by an additional 7 days, call .extendSession method and pass in the topic of the session you wish to extend.


Copy
const { acknowledged } = await walletKit.extendSession({ topic });
// if you wish to be notified when the dapp acks the extend
// note that if the dapp is offline `acknowledged` will not resolve until it comes back online
await acknowledged();
​
🛠️ Usage examples
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

​
Session Disconnect
To initiate disconnect from a session(think session delete), call .disconnectSession by passing a topic & reason for the disconnect. The other peer will receive a session_delete and be notified that the session has been disconnected.

Note

It’s important that you’re subscribed to the session_delete event as well, to be notified when the other peer initiates a disconnect.

We recommend using the getSDKError utility function, that will provide ready-to-use reason payloads and is available in the @walletconnect/utils library.


Copy
await walletKit.disconnectSession({
  topic,
  reason: getSdkError("USER_DISCONNECTED"),
});
​
🛠️ Usage examples
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

​
Emitting Session Events
To emit session events, call the emitSessionEvent and pass in the params. If you wish to switch to chain/account that is not approved (missing from session.namespaces) you will have to update the session first. In the following example, the wallet will emit session_event that will instruct the dapp to switch the active accounts.


Copy
await walletKit.emitSessionEvent({
  topic,
  event: {
    name: "accountsChanged",
    data: ["0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb"],
  },
  chainId: "eip155:1",
});
In the following example, the wallet will emit session_event when the wallet switches chains.


Copy
await walletKit.emitSessionEvent({
  topic,
  event: {
    name: "chainChanged",
    data: 1,
  },
  chainId: "eip155:1",
});

Usage

Copy page

This section provides instructions on how to initialize the WalletKit client, approve sessions with supported namespaces, and respond to session requests, enabling easy integration of Web3 wallets with dapps through a simple and intuitive interface.

​
Cloud Configuration
Create a new project on Reown Cloud at https://cloud.reown.com and obtain a new project ID.

Don’t have a project ID?

Head over to Reown Cloud and create a new project now!

Get started
​
Initialization
Create a new instance from Core and initialize it with a projectId created from installation. Next, create WalletKit instance by calling init on walletKit. Passing in the options object containing metadata about the app and an optional relay URL.

Make sure you initialize walletKit globally and use the same instance for all your sessions. For React-based apps, you can initialize it in the root component and export it to use in other components.


Copy
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";

const core = new Core({
  projectId: process.env.PROJECT_ID,
});

const walletKit = await WalletKit.init({
  core, // <- pass the shared `core` instance
  metadata: {
    name: "Demo app",
    description: "Demo Client as Wallet/Peer",
    url: "https://reown.com/walletkit",
    icons: [],
  },
});
​
Session
A session is a connection between a dapp and a wallet. It is established when a user approves a session proposal from a dapp. A session is active until the user disconnects from the dapp or the session expires.

​
Namespace Builder
With WalletKit (and @walletconnect/utils) we’ve published a helper utility that greatly reduces the complexity of parsing the required and optional namespaces. It accepts as parameters a session proposal along with your user’s chains/methods/events/accounts and returns ready-to-use namespaces object.


Copy
// util params
{
  proposal: ProposalTypes.Struct; // the proposal received by `.on("session_proposal")`
  supportedNamespaces: Record< // your Wallet's supported namespaces
    string, // the supported namespace key e.g. eip155
    {
      chains: string[]; // your supported chains in CAIP-2 format e.g. ["eip155:1", "eip155:2", ...]
      methods: string[]; // your supported methods e.g. ["personal_sign", "eth_sendTransaction"]
      events: string[]; // your supported events e.g. ["chainChanged", "accountsChanged"]
      accounts: string[] // your user's accounts in CAIP-10 format e.g. ["eip155:1:0x453d506b1543dcA64f57Ce6e7Bb048466e85e228"]
      }
  >;
};
Example usage


Copy
// import the builder util
import { WalletKit, WalletKitTypes } from '@reown/walletkit'
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils'

async function onSessionProposal({ id, params }: WalletKitTypes.SessionProposal){
  try{
    // ------- namespaces builder util ------------ //
    const approvedNamespaces = buildApprovedNamespaces({
      proposal: params,
      supportedNamespaces: {
        eip155: {
          chains: ['eip155:1', 'eip155:137'],
          methods: ['eth_sendTransaction', 'personal_sign'],
          events: ['accountsChanged', 'chainChanged'],
          accounts: [
            'eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb',
            'eip155:137:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb'
          ]
        }
      }
    })
    // ------- end namespaces builder util ------------ //

    const session = await walletKit.approveSession({
      id,
      namespaces: approvedNamespaces
    })
  }catch(error){
    // use the error.message to show toast/info-box letting the user know that the connection attempt was unsuccessful
    ....
    await walletKit.rejectSession({
      id: proposal.id,
      reason: getSdkError("USER_REJECTED")
    })
  }
}


walletKit.on('session_proposal', onSessionProposal)
If your wallet supports multiple namespaces e.g. eip155,cosmos & near Your supportedNamespaces should look like the following example.


Copy
// ------- namespaces builder util ------------ //
const approvedNamespaces = buildApprovedNamespaces({
    proposal: params,
    supportedNamespaces: {
        eip155: {...},
        cosmos: {...},
        near: {...}
    },
});
// ------- end namespaces builder util ------------ //
​
Get Active Sessions
You can get the wallet active sessions using the getActiveSessions function.


Copy
const activeSessions = walletKit.getActiveSessions();
​
EVM methods & events
In @walletconnect/ethereum-provider, (our abstracted EVM SDK for apps) we support by default the following Ethereum methods and events:


Copy
{
  //...
  methods: [
    "eth_accounts",
    "eth_requestAccounts",
    "eth_sendRawTransaction",
    "eth_sign",
    "eth_signTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_sendTransaction",
    "personal_sign",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_getPermissions",
    "wallet_requestPermissions",
    "wallet_registerOnboarding",
    "wallet_watchAsset",
    "wallet_scanQRCode",
    "wallet_sendCalls",
    "wallet_getCallsStatus",
    "wallet_showCallsStatus",
    "wallet_getCapabilities",
  ],
  events: [
    "chainChanged",
    "accountsChanged",
    "message",
    "disconnect",
    "connect",
  ]
}
​
Session Approval
The session_proposal event is emitted when a dapp initiates a new session with a user’s wallet. The event will include a proposal object with information about the dapp and requested permissions. The wallet should display a prompt for the user to approve or reject the session. If approved, call approveSession and pass in the proposal.id and requested namespaces.

The pair method initiates a WalletConnect pairing process with a dapp using the given uri (QR code from the dapps). To learn more about pairing, checkout out the docs.


Copy
walletKit.on(
  "session_proposal",
  async (proposal: WalletKitTypes.SessionProposal) => {
    const session = await walletKit.approveSession({
      id: proposal.id,
      namespaces,
    });
  }
);
await walletKit.pair({ uri });
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
No matching key. proposal id doesn't exist: 1
This rejection means the SDK can’t find a record with the given proposal.id - in this example 1. This can happen when the proposal has expired (by default 5 minutes) or if you attempt to respond to a proposal that has already been approved/rejected. If you are seeing this error, please make sure that you are calling approveSession with the correct proposal.id that is available within the proposal payload.

Error: Missing or invalid. approve(), namespaces should be an object with data
This error means that the namespaces parameter passed to approveSession is either missing or invalid. Please check that you are passing a valid namespaces object that satisfies all required properties.

Non conforming namespaces. approve() namespaces <property> don't satisfy required namespaces.
This error indicates that some value(s) in your namespaces object do not satisfy the required namespaces requested by the dapp. To provide additional guidance, the message might include info about the exact property that is missing or invalid e.g. Required: eip155:1 Approved: eip155:137. Please check CAIP-25 to familiarize yourself with the standard and it’s nuances. Additionally, we highly recommend you to use our namespace builder utility that would greatly simplify the process of parsing & building a valid namespaces object.

​
Session Rejection
In the event you want to reject the session proposal, call the rejectSession method. The getSDKError function comes from the @walletconnect/utils library.


Copy
walletKit.on(
  "session_proposal",
  async (proposal: WalletKitTypes.SessionProposal) => {
    await walletKit.rejectSession({
      id: proposal.id,
      reason: getSdkError("USER_REJECTED_METHODS"),
    });
  }
);
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
No matching key. proposal id doesn't exist: 1
This rejection means the SDK can’t find a record with the given proposal.id - in this example 1. This can happen when the proposal has expired (by default 5 minutes) or if you attempt to respond to a proposal that has already been approved/rejected. If you are seeing this error, please make sure that you are calling rejectSession with the correct proposal.id that is available within the proposal payload.

Error: Missing or invalid. reject() reason:
This rejection means the reason parameter passed to rejectSession is either missing or invalid. We recommend using the getSDKError function from the @walletconnect/utils library that will populate & format the parameter for you.

​
Responding to Session requests
The session_request event is emitted when the SDK received a request from the peer and it needs the wallet to perform a specific action, such as signing a transaction. The event contains a topic and a request object, which will vary depending on the action requested.

To respond to the request, you can access the topic and request object by destructuring them from the event payload. To see a list of possible request and response objects, refer to the relevant JSON-RPC Methods for Ethereum, Solana, Cosmos, or Stellar.

As an example, if the dapp requests a personal_sign method, you can extract the params array from the request object. The first item in the array is the hex version of the message to be signed, which can be converted to UTF-8 and assigned to a message variable. The second item in params is the user’s wallet address.

To sign the message, you can use your wallet’s signMessage method and pass in the message. The signed message, along with the id from the event payload, can then be used to create a response object, which can be passed into respondSessionRequest.


Copy
walletKit.on(
  "session_request",
  async (event: WalletKitTypes.SessionRequest) => {
    const { topic, params, id } = event;
    const { request } = params;
    const requestParamsMessage = request.params[0];

    // convert `requestParamsMessage` by using a method like hexToUtf8
    const message = hexToUtf8(requestParamsMessage);

    // sign the message
    const signedMessage = await wallet.signMessage(message);

    const response = { id, result: signedMessage, jsonrpc: "2.0" };

    await walletKit.respondSessionRequest({ topic, response });
  }
);
To reject a session request, the response should be similar to this.


Copy
const response = {
  id,
  jsonrpc: "2.0",
  error: {
    code: 5000,
    message: "User rejected.",
  },
};
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session has been disconnected by either the wallet or the dapp while the session request was being processed or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic that is available within the request payload.

Error: Missing or invalid. respond() response:
This rejection means the response parameter passed to respondSessionRequest is either missing or invalid. The response should be a valid JSON-RPC 2.0 response object. We recommend you to use our formatJsonRpcResult utility from "@walletconnect/jsonrpc-utils" that will format the response for you.

Example usage: id argument being the request id from the request payload.


Copy
import { formatJsonRpcResult } from "@walletconnect/jsonrpc-utils";

const signature = await cryptoWallet.signTransaction(signTransaction);
const response = await walletKit.respondSessionRequest({
  topic: session.topic,
  response: formatJsonRpcResult(id, signature),
});
​
Updating a Session
If you wish to include new accounts or chains or methods in an existing session, updateSession allows you to do so. You need pass in the topic and a new Namespaces object that contains all of the existing namespaces as well as the new data you wish to include. After you update the session, the other peer will receive a session_update event.

An example adding a new account to an existing session:


Copy
const namespaces = session.namespaces;
const accounts = [
  "eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  "eip155:1:0x1234567890123456789012345678901234567890",
];
const updatedNamespaces = {
  ...namespaces,
  eip155: {
    ...namespaces.eip155,
    accounts,
  },
};
const { acknowledged } = await walletKit.updateSession({
  topic: session.topic,
  namespaces: updatedNamespaces,
});
// If you wish to be notified when the dapp acknowledges the update.
// note that if the dapp is offline `acknowledged` will not resolve until it comes back online
await acknowledged();
An example adding a new chain to an existing session:


Copy
const namespaces = session.namespaces;
const chains = ["eip155:1", "eip155:137"];
const accounts = [
  "eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  "eip155:137:0x1234567890123456789012345678901234567890",
];
const updatedNamespaces = {
  ...namespaces,
  eip155: {
    ...namespaces.eip155,
    accounts,
    chains,
  },
};
await walletKit.updateSession({
  topic: session.topic,
  namespaces: updatedNamespaces,
});
​
🛠️ Usage examples
in a demo wallet app
in integration tests
​
⚠️ Expected Errors
Note that all namespaces validation applies and you still have to satisfy the required namespaces requested by the dapp.

Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

Error: Missing or invalid. update(), namespaces should be an object with data
This error means that the namespaces parameter passed to updateSession is either missing or invalid. Please check that you are passing a valid namespaces object that satisfies all required properties.

Non conforming namespaces. update() namespaces <property> don't satisfy required namespaces.
This error indicates that some value(s) in your namespaces object do not satisfy the required namespaces requested by the dapp. To provide additional guidance, the message might include info about the exact property that is missing or invalid e.g. Required: eip155:1 Approved: eip155:137. Please check CAIP-25 to familiarize yourself with the standard and it’s nuances. Additionally, we highly recommend you to use our namespace builder utility that would greatly simplify the process of parsing & building a valid namespaces object.

​
Extending a Session
Sessions have a default expiry of 7 days. To extend a session by an additional 7 days, call .extendSession method and pass in the topic of the session you wish to extend.


Copy
const { acknowledged } = await walletKit.extendSession({ topic });
// if you wish to be notified when the dapp acks the extend
// note that if the dapp is offline `acknowledged` will not resolve until it comes back online
await acknowledged();
​
🛠️ Usage examples
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

​
Session Disconnect
To initiate disconnect from a session(think session delete), call .disconnectSession by passing a topic & reason for the disconnect. The other peer will receive a session_delete and be notified that the session has been disconnected.

Note

It’s important that you’re subscribed to the session_delete event as well, to be notified when the other peer initiates a disconnect.

We recommend using the getSDKError utility function, that will provide ready-to-use reason payloads and is available in the @walletconnect/utils library.


Copy
await walletKit.disconnectSession({
  topic,
  reason: getSdkError("USER_DISCONNECTED"),
});
​
🛠️ Usage examples
in integration tests
​
⚠️ Expected Errors
Error: No matching key. session topic doesn't exist: 'xyz...'
This rejection means the SDK can’t find a session with the given topic - in this example xyz.... This can happen when the session you’re trying to update has already been disconnected by either the wallet or the dapp or if a session with such topic doesn’t exist. If you are seeing this error, please make sure that you are using a correct topic of an active session.

​
Emitting Session Events
To emit session events, call the emitSessionEvent and pass in the params. If you wish to switch to chain/account that is not approved (missing from session.namespaces) you will have to update the session first. In the following example, the wallet will emit session_event that will instruct the dapp to switch the active accounts.


Copy
await walletKit.emitSessionEvent({
  topic,
  event: {
    name: "accountsChanged",
    data: ["0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb"],
  },
  chainId: "eip155:1",
});
In the following example, the wallet will emit session_event when the wallet switches chains.


Copy
await walletKit.emitSessionEvent({
  topic,
  event: {
    name: "chainChanged",
    data: 1,
  },
  chainId: "eip155:1",
});
