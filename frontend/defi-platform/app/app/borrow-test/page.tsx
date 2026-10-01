'use client';

import { BorrowTest } from '@/components/test/BorrowTest';

export default function BorrowTestPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Borrow Flow Test - Monad Mainnet</h1>
        <p className="text-muted-foreground mb-4">
          Test borrowing functionality across all chains including Monad Mainnet. Debug contract interactions and wallet balances.
        </p>
        <div className="bg-muted/50 border rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium">Features to Test:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Chain Switching:</strong> Test across BSC Mainnet, Monad Mainnet, and other networks</li>
            <li><strong>Wallet Balance:</strong> View real-time wallet balances for each asset</li>
            <li><strong>Borrowing Power:</strong> Check available borrowing capacity and collateral</li>
            <li><strong>Contract Interaction:</strong> Test borrow transactions with contract addresses displayed</li>
            <li><strong>Debug Info:</strong> View detailed contract configuration and transaction status</li>
          </ul>
        </div>
      </div>
      <BorrowTest />
    </div>
  );
}

