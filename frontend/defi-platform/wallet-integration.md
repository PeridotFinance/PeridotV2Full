Nachgedacht für 1m 0s
Ziel & Vorgehen
Du willst dein Next.js-Frontend so aufstellen, dass es

EVM-Smart-Contracts (die dir dein Kollege als ABI-JSON geschickt hat) über WalletConnect ansprechen kann,

Solana-Transaktionen unter derselben Oberfläche zulässt und

optional Cross-Chain-Transfers via Wormhole anbietet.

Dafür trennen wir die Zuständigkeiten in drei Provider-Layer:


Layer	Aufgabe	Tech-Stack
EvmProvider	WalletConnect v2 + wagmi/viem (Ethers optional)	wagmi, viem, @web3modal/wagmi, walletconnect
SolanaProvider	Wallet-Adapter-Context & Wallet-UI	@solana/wallet-adapter-*
BridgeWidget	Fertiges Wormhole-Widget (React)	@wormhole-foundation/wormhole-connect
Danach kannst du jeden Smart-Contract mit einem Hook aufrufen (lesen/schreiben) und gleichzeitig einen “Bridge”-Tab einbauen.

1 · EVM-Integration (WalletConnect v2)
a) Pakete installieren

bash
Kopieren
Bearbeiten
npm i wagmi viem @web3modal/wagmi react @walletconnect/core @web3modal/ethereum
b) Provider anlegen – /src/providers/EvmProvider.tsx

tsx
Kopieren
Bearbeiten
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
        showQrModal: false,           // über Web3Modal-Komponente gesteuert
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
Warum wagmi v2? WalletConnect v1 wird nicht mehr unterstützt, wagmi hat die Legacy-Connectoren entfernt. 
1.x.wagmi.sh

c) Contract-Hook Beispiel – /src/components/MyButton.tsx

tsx
Kopieren
Bearbeiten
import { abi } from '@/contracts/MyContract.json';   // ABI-Datei deines Kollegen
import { useAccount, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { parseEther } from 'viem';

export default function MyButton() {
  const { address } = useAccount();
  const { config } = usePrepareContractWrite({
    address: '0xYourContract',      // Deploy-Adresse
    abi,
    functionName: 'buy',
    args: [parseEther('0.05')],
  });
  const { write, isLoading, isSuccess } = useContractWrite(config);

  if (!address) return <p>Verbinde Wallet …</p>;
  return (
    <button disabled={!write || isLoading} onClick={() => write?.()}>
      {isLoading ? 'Sende Tx …' : 'Kaufen'}
      {isSuccess && ' ✅'}
    </button>
  );
}
2 · Solana-Wallets einbinden
a) Pakete

bash
Kopieren
Bearbeiten
npm i @solana/web3.js @solana/wallet-adapter-react \
      @solana/wallet-adapter-react-ui \
      @solana/wallet-adapter-base @solana/wallet-adapter-wallets
b) Provider – /src/providers/SolanaProvider.tsx

tsx
Kopieren
Bearbeiten
'use client';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, BackpackWalletAdapter } from '@solana/wallet-adapter-wallets';

const WalletModalProvider = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(m => m.WalletModalProvider),
  { ssr: false },
);

require('@solana/wallet-adapter-react-ui/styles.css'); // eigenes CSS importieren

export function SolanaProvider({ children }: React.PropsWithChildren) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new BackpackWalletAdapter()],
    []
  );
  const endpoint = 'https://api.mainnet-beta.solana.com';
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider autoConnect wallets={wallets}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
Hydration-Fehler in Next.js werden dadurch umgangen, dass WalletModalProvider nur client-seitig geladen wird. 
Web3 Infrastructure for Everyone
GitHub

3 · Cross-Chain mit Wormhole Connect (optional)
bash
Kopieren
Bearbeiten
npm i @wormhole-foundation/wormhole-connect
Widget dynamisch laden (SSR ≠ Crypto-Wallets):

tsx
Kopieren
Bearbeiten
// components/Bridge.tsx
import dynamic from 'next/dynamic';
const WormholeConnect = dynamic(
  () => import('@wormhole-foundation/wormhole-connect').then(m => m.WormholeConnect),
  { ssr: false },
);

export default function Bridge() {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold mb-4">Bridge Assets</h2>
      <WormholeConnect
        defaultSourceChain="ethereum"
        defaultTargetChain="solana"
        referrer="your-dapp.com"
      />
    </div>
  );
}
Wormhole Connect bringt bereits alle gängigen EVM- & Solana-Wallets mit und nutzt dieselbe WalletConnect-Sitzung, sodass der User nichts doppelt bestätigen muss. 
Wormhole

4 · Alle Provider verdrahten
In app/layout.tsx (App Router) oder pages/_app.tsx (Pages Router):

tsx
Kopieren
Bearbeiten
import { EvmProvider } from '@/providers/EvmProvider';
import { SolanaProvider } from '@/providers/SolanaProvider';

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <EvmProvider>
          <SolanaProvider>{children}</SolanaProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
Was jetzt noch fehlt?

To-do	Hinweis
.env	NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=… aus Cloud WalletConnect Dashboard
RPC-Endpoints	Für Production zuverlässige RPC (z. B. Alchemy, Infura, QuickNode, Helius) nutzen
Type-Safety	EVM: viem’s parseAbi; Solana: Anchor-IDL + @coral-xyz/anchor
Gas & Fee UX	Wagmi-Hook useFeeData, Solana Priority Fees via computeBudget falls nötig 
Wormhole
Security	Unbedingt Signer-Side-Checks & Re-entrancy Schutz im Contract beachten
Damit hast du eine saubere, modulare Grundlage, die WalletConnect v2, Solana-Wallet-Adapter und das Wormhole-Bridge-Widget kombiniert – einsatzbereit in deinem Next.js-Frontend. Viel Erfolg beim Verbinden deiner Cross-Chain-App!