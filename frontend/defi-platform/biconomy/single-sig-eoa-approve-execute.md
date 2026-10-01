# Single Signature Approve + Execute

This example demonstrates a flow where the user uses a single signature from their
EOA wallet to execute `approve` + `execute` instructions.

```ts
import { 
  aave, 
  createMeeClient, 
  getMeeScanLink, 
  toMultichainNexusAccount, 
  type Trigger, 
  getMEEVersion, 
  MEEVersion 
} from "@biconomy/abstractjs";
import { erc20Abi, http, parseAbi, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";

const eoa = privateKeyToAccount(Bun.env.PRIVATE_KEY as Hex)

const orchestrator = await toMultichainNexusAccount({
  signer: eoa,
  chainConfigurations: [
    {
      chain: optimism,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    },
    {
      chain: base,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0)
    }
  ]
})

const meeClient = await createMeeClient({
  account: orchestrator
})

const amount = parseUnits('10', 6)
const aaveV3 = '0xUniswap'

const usdc = '0xUSDC'

const approve = await orchestrator.buildComposable({
  type: 'default',
  data: {
    abi: erc20Abi,
    chainId: optimism.id,
    to: usdc,
    functionName: 'approve',
    args: [
      aaveV3,
      amount
    ]
  }
})

const aaveV3Abi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external'
]);

const supply = await orchestrator.buildComposable({
  type: 'default',
  data: {
    abi: aaveV3Abi,
    to: aaveV3,
    chainId: optimism.id,
    functionName: 'supply',
    args: [
      usdc,
      amount,
      eoa.address,
      0n
    ]
  }
})

const trigger: Trigger = {
  chainId: optimism.id,
  tokenAddress: usdc,
  amount: amount
}

const fusionQuote = await meeClient.getFusionQuote({
  instructions: [approve, supply],
  trigger: trigger,
  feeToken: {
    address: usdc,
    chainId: optimism.id
  }
})

const { hash } = await meeClient.executeFusionQuote({
  fusionQuote
})

console.log(`MEEScan Link: ${getMeeScanLink(hash)}`)

const receipt = await meeClient.waitForSupertransactionReceipt({ hash })
```