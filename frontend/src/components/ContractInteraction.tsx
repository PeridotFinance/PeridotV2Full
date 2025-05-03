'use client';
import { useAccount, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { parseEther } from 'viem';

// This would typically come from an imported contract ABI JSON file
const contractAbi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "buy",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

export default function ContractInteraction() {
  const { address, isConnected } = useAccount();
  
  const { config } = usePrepareContractWrite({
    address: '0xYourContractAddress', // Replace with actual contract address
    abi: contractAbi,
    functionName: 'buy',
    args: [parseEther('0.05')],
  });
  
  const { write, isLoading, isSuccess } = useContractWrite(config);

  if (!isConnected) return <p>Please connect your wallet</p>;
  
  return (
    <div className="p-4 border rounded-md">
      <h2 className="text-lg font-semibold mb-4">Contract Interaction</h2>
      <p className="mb-2">Connected address: {address}</p>
      <button 
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={!write || isLoading} 
        onClick={() => write?.()}
      >
        {isLoading ? 'Transaction in progress...' : 'Buy (0.05 ETH)'}
      </button>
      {isSuccess && <p className="mt-2 text-green-500">Transaction successful! ✅</p>}
    </div>
  );
} 