import ContractInteraction from '@/components/ContractInteraction';
import CompleteContractExample from '@/components/CompleteContractExample';

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">DeFi Platform</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Simple Contract Interaction</h2>
          <ContractInteraction />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">Advanced Contract Interaction</h2>
          <CompleteContractExample />
        </div>
      </div>
    </main>
  );
} 