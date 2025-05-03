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