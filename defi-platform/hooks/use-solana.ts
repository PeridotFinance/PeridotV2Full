'use client'

import { useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react'
import { useAppKitConnection } from '@reown/appkit-adapter-solana/react'
import { 
  SystemProgram, 
  PublicKey, 
  Transaction,
  LAMPORTS_PER_SOL,
  Connection
} from '@solana/web3.js'

export function useSolana() {
  const { address, isConnected } = useAppKitAccount()
  const { caipNetwork } = useAppKitNetwork()
  const { connection } = useAppKitConnection()

  // Debug logging
  console.log('useSolana Debug:', {
    address,
    isConnected,
    caipNetwork,
    networkId: caipNetwork?.id,
    networkName: caipNetwork?.name,
    connection: !!connection
  })

  // Improved Solana detection based on official AppKit documentation
  // The primary indicator is having both isConnected and a Solana connection object
  const isSolanaConnected = isConnected && !!connection

  console.log('isSolanaConnected:', isSolanaConnected)
  
  const getBalance = async (publicKey?: PublicKey | string): Promise<number> => {
    if (!connection) throw new Error('No Solana connection available')
    
    let pubKey: PublicKey
    if (publicKey) {
      pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey
    } else if (address) {
      // Try to use the connected address as Solana public key
      try {
        pubKey = new PublicKey(address)
      } catch {
        throw new Error('Invalid public key format')
      }
    } else {
      throw new Error('No public key available')
    }
    
    const balance = await connection.getBalance(pubKey)
    return balance / LAMPORTS_PER_SOL
  }

  const createTransferTransaction = (
    from: PublicKey | string,
    to: PublicKey | string,
    amount: number // Amount in SOL
  ): Transaction => {
    const transaction = new Transaction()
    
    const fromPubKey = typeof from === 'string' ? new PublicKey(from) : from
    const toPubKey = typeof to === 'string' ? new PublicKey(to) : to
    
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: fromPubKey,
      toPubkey: toPubKey,
      lamports: amount * LAMPORTS_PER_SOL,
    })
    
    transaction.add(transferInstruction)
    return transaction
  }

  return {
    // Connection state
    address,
    isConnected: isSolanaConnected,
    connection,
    publicKey: address && isSolanaConnected ? (
      (() => {
        try {
          return new PublicKey(address)
        } catch {
          return null
        }
      })()
    ) : null,
    network: caipNetwork,
    
    // Utility functions
    getBalance,
    createTransferTransaction,
    
    // Constants
    LAMPORTS_PER_SOL,
  }
}

export default useSolana 