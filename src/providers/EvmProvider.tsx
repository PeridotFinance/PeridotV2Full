'use client';
import { WagmiConfig, configureChains, createConfig } from 'wagmi';
import { mainnet, polygon, arbitrum, optimism, avalanche } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';
import { walletConnectProvider, EthereumClient } from '@web3modal/ethereum';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { Web3Modal } from '@web3modal/wagmi/react';

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!; // .env

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [mainnet, polygon, arbitrum, optimism, avalanche],
  [walletConnectProvider({ projectId: wcProjectId }), publicProvider()]
);

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: [
    new WalletConnectConnector({
      chains,
      options: {
        projectId: wcProjectId,
        showQrModal: false,           // controlled by Web3Modal component
      },
    }),
  ],
  publicClient,
  webSocketPublicClient,
});

const ethereumClient = new EthereumClient(wagmiConfig, chains);

export function EvmProvider({ children }: React.PropsWithChildren) {
  return (
    <>
      <WagmiConfig config={wagmiConfig}>{children}</WagmiConfig>
      {/* UI-Layer */}
      <Web3Modal projectId={wcProjectId} ethereumClient={ethereumClient} />
    </>
  );
} 