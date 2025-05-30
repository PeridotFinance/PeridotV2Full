# Multi-Chain Wallet Integration Guide

## Overview

Peridot Finance now supports both **EVM** (Ethereum, Arbitrum, etc.) and **Solana** networks through a unified wallet connection experience using Reown AppKit (formerly WalletConnect).

## Architecture

### Core Components

1. **Configuration** (`config/index.tsx`)
   - `wagmiAdapter`: Handles EVM wallet connections
   - `solanaAdapter`: Handles Solana wallet connections
   - Separate network configurations for each chain type

2. **Context Provider** (`context/index.tsx`)
   - Initializes AppKit with both adapters
   - Provides unified wallet connection experience

3. **Custom Hooks** (`hooks/use-solana.ts`)
   - `useSolana()`: Provides Solana-specific functionality
   - Balance checking, transaction sending, wallet status

4. **UI Components**
   - `ConnectWalletButton`: Universal wallet connection button
   - `MultiChainStatus`: Shows status of both EVM and Solana connections

## Features

### ✅ Supported Networks

**EVM Networks:**
- Ethereum Mainnet
- Arbitrum
- Additional networks from `config/networks.ts`

**Solana Networks:**
- Solana Mainnet
- Solana Testnet  
- Solana Devnet

### ✅ Wallet Functionality

**EVM Wallets:**
- MetaMask, WalletConnect, Coinbase Wallet, etc.
- Full Wagmi integration for contract interactions
- Balance display and transaction support

**Solana Wallets:**
- Phantom, Solflare, Backpack, etc.
- Native Solana web3.js integration
- SOL balance display and transfer functionality

## Implementation Details

### 1. Wallet Connection Flow

```typescript
// User clicks connect button
<ConnectWalletButton />

// AppKit modal opens with both EVM and Solana options
// User selects wallet type and connects

// App detects connection type via network ID
const isSolanaConnected = caipNetwork?.id?.includes('solana')
```

### 2. Network Detection

The app automatically detects which network the user is connected to:

```typescript
const isEvmNetwork = caipNetwork?.id?.includes('eip155') || 
                     caipNetwork?.id?.includes('ethereum') || 
                     caipNetwork?.id?.includes('arbitrum')

const isSolanaNetwork = caipNetwork?.id?.includes('solana')
```

### 3. Balance Management

**EVM Balance:**
```typescript
const { data: evmBalance } = useBalance({
  address: evmAddress,
  query: { enabled: isEvmConnected }
})
```

**Solana Balance:**
```typescript
const { getBalance } = useSolana()
const balance = await getBalance() // Returns SOL amount
```

### 4. Transaction Handling

**Solana Transactions:**
```typescript
const { sendTransaction, createTransferTransaction } = useSolana()

// Create transfer
const transaction = createTransferTransaction(fromPubkey, toPubkey, amount)

// Send transaction
const signature = await sendTransaction(transaction, signers)
```

## User Experience

### Dashboard Integration

The Solana Dashboard (`/solana-dashboard`) showcases the multi-chain integration:

1. **Wallet Connection Section**
   - Universal connect button
   - Multi-chain status display
   - Connected wallet information

2. **Auto-population**
   - When Solana wallet is connected, forms auto-populate with the connected address
   - Visual indicators show when connected wallet is being used

3. **Network Switching**
   - Users can switch networks directly in their wallet
   - App automatically detects and adapts to the new network

### Header Integration

The site header includes wallet connection for app routes:
- Desktop: Wallet button appears before theme toggle
- Mobile: Both wallet and theme buttons in mobile menu

## Development Guide

### Adding New EVM Networks

1. Add network configuration to `config/networks.ts`
2. Import and add to `evmNetworks` array in `config/index.tsx`

### Adding New Solana Features

1. Extend the `useSolana` hook with new functionality
2. Add new transaction types to the hook
3. Update UI components to use new features

### Creating Multi-Chain Components

```typescript
import { useAccount } from 'wagmi'
import { useSolana } from '@/hooks/use-solana'

function MyMultiChainComponent() {
  // EVM data
  const { isConnected: isEvmConnected, address: evmAddress } = useAccount()
  
  // Solana data
  const { isConnected: isSolanaConnected, publicKey: solanaPublicKey } = useSolana()
  
  return (
    <div>
      {isEvmConnected && <div>EVM: {evmAddress}</div>}
      {isSolanaConnected && <div>Solana: {solanaPublicKey?.toString()}</div>}
    </div>
  )
}
```

## Security Considerations

1. **Network Validation**: Always validate network IDs before processing transactions
2. **Public Key Verification**: Verify Solana public keys before using them
3. **Transaction Signing**: Never sign transactions without user consent
4. **Error Handling**: Gracefully handle network switching and connection errors

## Environment Variables

Ensure your `.env.local` includes:

```env
NEXT_PUBLIC_PROJECT_ID="your_walletconnect_project_id"
```

## Testing

### Local Development

1. Connect EVM wallet (MetaMask) on Ethereum or Arbitrum
2. Connect Solana wallet (Phantom) on Devnet
3. Switch between networks to test detection
4. Test balance fetching and transaction creation

### Integration Testing

- Test wallet connection flow
- Verify network detection accuracy
- Test auto-population features
- Confirm transaction signing works

## Troubleshooting

### Common Issues

1. **"No Solana connection available"**
   - Ensure wallet is connected to a Solana network
   - Check network configuration

2. **"Invalid public key"**
   - Verify wallet connection status
   - Check if user switched networks

3. **Balance not loading**
   - Confirm network connection
   - Check RPC endpoint availability

### Debug Tips

```typescript
// Log current network info
console.log('Current network:', caipNetwork)
console.log('Is Solana connected:', isSolanaConnected)
console.log('Solana public key:', solanaPublicKey?.toString())
```

## Future Enhancements

- [ ] Add support for more Solana token standards (SPL tokens)
- [ ] Implement cross-chain transaction bridging
- [ ] Add support for additional blockchain networks
- [ ] Enhanced transaction history tracking
- [ ] Multi-wallet connection support

## References

- [Reown AppKit Documentation](https://docs.reown.com/appkit)
- [Wagmi Documentation](https://wagmi.sh/)
- [Solana Web3.js Documentation](https://docs.solana.com/developing/clients/javascript-api)
- [AppKit Solana Adapter](https://docs.reown.com/appkit/solana/core/installation) 