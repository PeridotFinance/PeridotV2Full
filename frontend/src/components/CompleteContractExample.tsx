'use client';
import { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { abi } from '@/contracts/MyContract.json';

export default function CompleteContractExample() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('0.01');

  // Read contract balance
  const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useContractRead({
    address: '0xYourContractAddress', // Replace with actual contract address
    abi,
    functionName: 'getBalance',
    watch: true,
  });

  // Prepare buy transaction
  const { config: buyConfig } = usePrepareContractWrite({
    address: '0xYourContractAddress',
    abi,
    functionName: 'buy',
    args: [parseEther(amount || '0')],
    value: parseEther(amount || '0'),
  });

  // Execute buy transaction
  const { 
    write: executeBuy, 
    isLoading: isBuyLoading, 
    isSuccess: isBuySuccess,
    reset: resetBuy
  } = useContractWrite(buyConfig);

  // Prepare withdraw transaction
  const { config: withdrawConfig } = usePrepareContractWrite({
    address: '0xYourContractAddress',
    abi,
    functionName: 'withdraw',
  });

  // Execute withdraw transaction
  const { 
    write: executeWithdraw, 
    isLoading: isWithdrawLoading, 
    isSuccess: isWithdrawSuccess,
    reset: resetWithdraw
  } = useContractWrite(withdrawConfig);

  // Reset states when transaction completes
  if (isBuySuccess || isWithdrawSuccess) {
    setTimeout(() => {
      resetBuy?.();
      resetWithdraw?.();
      refetchBalance();
    }, 3000);
  }

  if (!isConnected) return <p>Please connect your wallet</p>;
  
  return (
    <div className="p-6 border rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Contract Interaction</h2>
      <p className="mb-4">Connected address: {address}</p>
      
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Contract Balance</h3>
        <p className="text-gray-700">
          {isBalanceLoading ? 'Loading...' : 
           balance ? `${formatEther(balance as bigint)} ETH` : 'Not available'}
        </p>
        <button 
          className="mt-2 text-sm text-blue-500 hover:underline"
          onClick={() => refetchBalance()}
        >
          Refresh balance
        </button>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Buy Function</h3>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border rounded px-3 py-2 w-24"
            placeholder="ETH amount"
          />
          <span>ETH</span>
        </div>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          disabled={!executeBuy || isBuyLoading} 
          onClick={() => executeBuy?.()}
        >
          {isBuyLoading ? 'Processing...' : `Buy with ${amount} ETH`}
        </button>
        {isBuySuccess && <p className="mt-2 text-green-500">Purchase successful! ✅</p>}
      </div>
      
      <div>
        <h3 className="text-lg font-medium mb-2">Withdraw Function</h3>
        <button 
          className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50"
          disabled={!executeWithdraw || isWithdrawLoading} 
          onClick={() => executeWithdraw?.()}
        >
          {isWithdrawLoading ? 'Processing...' : 'Withdraw All'}
        </button>
        {isWithdrawSuccess && <p className="mt-2 text-green-500">Withdrawal successful! ✅</p>}
      </div>
    </div>
  );
} 