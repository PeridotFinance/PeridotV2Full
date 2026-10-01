import { createPublicClient, http, formatUnits, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'

// Monad Mainnet Config
const RPC_URL = 'https://rpc.monad.xyz/'; 
const CHAIN_ID = 143;

const CONTRACTS = {
  gMON: {
    pToken: '0xA5a7f20604130a715815F4a6769bcF71366cAcB4', // Correct pToken from contracts.ts
    underlying: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', // Correct underlying from contracts.ts
    symbol: 'gMON'
  },
  Oracle: '0x5800B480382e23cbe3553590169b78A42809D22c'
}

const ORACLE_ABI = parseAbi([
  'function getUnderlyingPrice(address pToken) view returns (uint256)',
  'function assetPrices(address asset) view returns (uint256)'
]);

const PTOKEN_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
]);

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
]);

async function main() {
  const client = createPublicClient({
    chain: {
      id: CHAIN_ID,
      name: 'Monad',
      network: 'monad',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } }
    },
    transport: http()
  });

  console.log('🔍 Checking gMON Price on Monad Mainnet...');
  
  try {
    // 1. Check pToken details
    console.log('\n--- pToken Details ---');
    const [pSymbol, pDecimals] = await Promise.all([
      client.readContract({ address: CONTRACTS.gMON.pToken as `0x${string}`, abi: PTOKEN_ABI, functionName: 'symbol' }).catch(e => 'ERR'),
      client.readContract({ address: CONTRACTS.gMON.pToken as `0x${string}`, abi: PTOKEN_ABI, functionName: 'decimals' }).catch(e => 0),
    ]);
    console.log(`Symbol: ${pSymbol}`);
    console.log(`Decimals: ${pDecimals}`);

    // 2. Check Underlying details
    console.log('\n--- Underlying Details ---');
    const [uSymbol, uDecimals] = await Promise.all([
      client.readContract({ address: CONTRACTS.gMON.underlying as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol' }).catch(e => 'ERR'),
      client.readContract({ address: CONTRACTS.gMON.underlying as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals' }).catch(e => 0),
    ]);
    console.log(`Symbol: ${uSymbol}`);
    console.log(`Decimals: ${uDecimals}`);

    // 3. Fetch Price via getUnderlyingPrice (pToken)
    console.log('\n--- Oracle: getUnderlyingPrice(pToken) ---');
    try {
      const priceRaw = await client.readContract({
        address: CONTRACTS.Oracle as `0x${string}`,
        abi: ORACLE_ABI,
        functionName: 'getUnderlyingPrice',
        args: [CONTRACTS.gMON.pToken as `0x${string}`]
      });
      
      const uDec = Number(uDecimals) || 18;
      const mantissa = 36 - uDec; 
      
      const priceFmt = formatUnits(priceRaw, mantissa);
      const priceFmt18 = formatUnits(priceRaw, 18);
      const priceFmt6 = formatUnits(priceRaw, 6); // Try other decimals just in case
      
      console.log(`Raw: ${priceRaw}`);
      console.log(`Formatted (36 - ${uDec} = ${mantissa} decimals): $${priceFmt}`);
      console.log(`Formatted (18 decimals): $${priceFmt18}`);
      console.log(`Formatted (6 decimals): $${priceFmt6}`);
      
      // Check for 1.08
      if (priceFmt.includes('1.08') || priceFmt18.includes('1.08') || priceFmt6.includes('1.08')) {
        console.log('🚨 FOUND 1.08 HERE!');
      }
    } catch (e) {
      console.error('Error fetching getUnderlyingPrice:', e);
    }

  } catch (error) {
    console.error('Script Error:', error);
  }
}

main();
