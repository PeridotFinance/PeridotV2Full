'use client';

import { BiconomySupplyTest } from '@/components/biconomy/BiconomySupplyTest';

export default function BiconomySupplyTestPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Biconomy Supply Flow Test</h1>
        <p className="text-muted-foreground mb-4">
          Test the cross-chain supply flow using toMultichainNexusAccount and Fusion mode for external EOA wallets.
        </p>
        <div className="bg-muted/50 border rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium">Features to Test:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Fee Extraction:</strong> Test fee extraction from quote responses (regular and sponsored)</li>
            <li><strong>Transaction Status Monitoring:</strong> Test status polling via API and hook refresh</li>
            <li><strong>Integration Test:</strong> Verify all systems are working together</li>
            <li><strong>Full Supply Flow:</strong> Execute complete cross-chain supply with fee display and status tracking</li>
          </ul>
        </div>
      </div>
      <BiconomySupplyTest />
    </div>
  );
}

