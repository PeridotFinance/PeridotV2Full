/**
 * Shared wallet setup for integration tests.
 *
 * Node.js loads defi-platform/.env.test.local via the --env-file flag
 * in the test:integration script. Create that file with:
 *
 *   TEST_WALLET_PRIVATE_KEY=0x<your-private-key>
 *   # Optional: TEST_BSC_RPC_URL=https://bsc-dataseed1.binance.org/
 *
 * The wallet is initialised once and reused across all tests.
 */

import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'

const privateKey = process.env.TEST_WALLET_PRIVATE_KEY
if (!privateKey) {
  throw new Error(
    'TEST_WALLET_PRIVATE_KEY is not set.\n' +
    'Create defi-platform/.env.test.local with:\n' +
    '  TEST_WALLET_PRIVATE_KEY=0x<your-private-key>'
  )
}

const rpcUrl =
  process.env.TEST_BSC_RPC_URL ||
  'https://bsc-dataseed1.binance.org/'

export const account = privateKeyToAccount(privateKey as `0x${string}`)

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(rpcUrl),
})

export const walletClient = createWalletClient({
  account,
  chain: bsc,
  transport: http(rpcUrl),
})
