import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { superTxHash, destinationChainId } = await request.json()

    if (!superTxHash || !destinationChainId) {
      return NextResponse.json(
        { error: 'Missing required fields: superTxHash, destinationChainId' },
        { status: 400 }
      )
    }

    // Get Biconomy API key
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Biconomy API key not configured' },
        { status: 500 }
      )
    }

    // Call Biconomy API to check transaction status
    const biconomyUrl = `https://network.biconomy.io/v1/explorer/${superTxHash}`
    const response = await fetch(biconomyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      if (response.status === 404 || response.status === 400) {
        // Transaction not found or doesn't exist
        return NextResponse.json({
          isValid: false,
          reason: 'Cross-chain transaction not found or not executed'
        })
      }
      throw new Error(`Biconomy API error: ${response.status}`)
    }

    const biconomyData = await response.json()

    // Check if transaction was found and has userOps
    if (!biconomyData.userOps || !Array.isArray(biconomyData.userOps)) {
      return NextResponse.json({
        isValid: false,
        reason: 'Invalid Biconomy response structure'
      })
    }

    // Check if any userOp was successfully executed on the destination chain
    const destinationChainIdStr = String(destinationChainId)
    const successfulOps = biconomyData.userOps.filter((op: any) =>
      op.executionStatus === 'MINED_SUCCESS' &&
      op.isConfirmed === true &&
      String(op.chainId) === destinationChainIdStr
    )

    if (successfulOps.length === 0) {
      return NextResponse.json({
        isValid: false,
        reason: 'Cross-chain transaction did not execute successfully on destination chain'
      })
    }

    // Find the main execution op (prefer non-cleanup ops)
    const mainExecutionOp = successfulOps.find((op: any) => !op.isCleanUpUserOp) || successfulOps[0]

    return NextResponse.json({
      isValid: true,
      actionType: 'cross-chain_supply',
      contractAddress: mainExecutionOp.executionData || null,
      blockNumber: null, // Biconomy doesn't provide block numbers
      chainId: destinationChainId,
      executionData: mainExecutionOp.executionData,
      minedTimestamp: mainExecutionOp.minedTimestamp,
      gasCost: mainExecutionOp.actualGasCost
    })

  } catch (error) {
    console.error('Cross-chain verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify cross-chain transaction' },
      { status: 500 }
    )
  }
}










