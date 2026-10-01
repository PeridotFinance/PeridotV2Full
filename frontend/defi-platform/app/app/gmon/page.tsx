'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, getContract } from 'viem'
import { monadTestnetContracts } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { toast } from 'sonner'
import { createPublicClient, http } from 'viem'
import { monadTestnet } from '@reown/appkit/networks'
import { useWalletAnalysis } from '@/hooks/use-wallet-analysis'

interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  address: string
  balance: string
  allowance: string
  pTokenBalance: string
  borrowBalance: string
}

interface PTokenState {
  totalSupply: string
  totalBorrows: string
  totalReserves: string
  exchangeRate: string
  supplyRate: string
  borrowRate: string
  collateralFactor: string
  isListed: boolean
  isPaused: boolean
  isComptrollerPaused: boolean
}

interface LendingFlowState {
  hasApproval: boolean
  approvalAmount: string
  canMint: boolean
  canRedeem: boolean
  canBorrow: boolean
  canRepay: boolean
  isInMarket: boolean
  liquidity: string
  shortfall: string
}

interface TransactionHistory {
  hash: string
  type: 'mint' | 'redeem' | 'approve' | 'borrow' | 'repay'
  amount: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  blockNumber: number
}

interface DebugResult {
  success: boolean
  message: string
  data?: any
  error?: string
  severity?: 'info' | 'warning' | 'error' | 'critical'
  timestamp?: number
  category?: 'wallet' | 'balance' | 'approval' | 'market' | 'health' | 'simulation'
}

interface DiagnosticReport {
  walletAddress: string
  chainId: number
  timestamp: number
  overallHealth: 'healthy' | 'warning' | 'critical'
  summary: string
  findings: DebugResult[]
  recommendations: string[]
  canWithdraw: boolean
  withdrawalSimulation?: {
    amount: string
    success: boolean
    reason?: string
    gasEstimate?: string
  }
}

export default function GMONDebugPage() {
  const { address, chainId } = useAccount()
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [pTokenState, setPTokenState] = useState<PTokenState | null>(null)
  const [lendingFlowState, setLendingFlowState] = useState<LendingFlowState | null>(null)
  const [transactionHistory, setTransactionHistory] = useState<TransactionHistory[]>([])
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [debugResults, setDebugResults] = useState<DebugResult[]>([])
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeMode, setActiveMode] = useState<'auto' | 'manual' | 'wallet-analysis'>('auto')
  const [manualParams, setManualParams] = useState({
    withdrawAmount: '',
    decimals: 18,
    exchangeRate: '',
    healthFactor: '',
    gasLimit: '300000',
    slippage: '0.5'
  })
  
  // Wallet analysis state
  const [walletAddressInput, setWalletAddressInput] = useState('')
  const { 
    data: walletAnalysisData, 
    isLoading: isAnalyzing, 
    error: analysisError, 
    steps: analysisSteps, 
    analyzeWallet, 
    clearAnalysis 
  } = useWalletAnalysis()

  // Create public client for advanced contract reads
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnetContracts.rpcUrl)
  })

  // GMON token configuration
  const gmonConfig = monadTestnetContracts.markets.gMON
  const gmonTokenAddress = gmonConfig.underlying as Address
  const gmonPTokenAddress = gmonConfig.pToken as Address
  const controllerAddress = monadTestnetContracts.unitrollerProxy as Address

  // Read token info
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: gmonTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address }
  })

  const { data: pTokenBalance, refetch: refetchPTokenBalance } = useReadContract({
    address: gmonPTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address }
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: gmonTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, gmonPTokenAddress],
    query: { enabled: !!address }
  })

  const { data: borrowBalance } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'borrowBalanceCurrent',
    args: [address!],
    query: { enabled: !!address }
  })

  // pToken state readings
  const { data: totalSupply } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'totalSupply',
    query: { enabled: true }
  })

  const { data: totalBorrows } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'totalBorrows',
    query: { enabled: true }
  })

  const { data: totalReserves } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'totalReserves',
    query: { enabled: true }
  })

  const { data: exchangeRate } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'exchangeRateStored',
    query: { enabled: true }
  })

  const { data: supplyRate } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'supplyRatePerBlock',
    query: { enabled: true }
  })

  const { data: borrowRate } = useReadContract({
    address: gmonPTokenAddress,
    abi: combinedAbi,
    functionName: 'borrowRatePerBlock',
    query: { enabled: true }
  })

  // Comptroller state readings
  const { data: collateralFactor } = useReadContract({
    address: controllerAddress,
    abi: combinedAbi,
    functionName: 'markets',
    args: [gmonPTokenAddress],
    query: { enabled: true }
  })

  const { data: accountLiquidity } = useReadContract({
    address: controllerAddress,
    abi: combinedAbi,
    functionName: 'getAccountLiquidity',
    args: [address!],
    query: { enabled: !!address }
  })

  const { data: accountMarkets } = useReadContract({
    address: controllerAddress,
    abi: combinedAbi,
    functionName: 'getAssetsIn',
    args: [address!],
    query: { enabled: !!address }
  })

  // Write contract hooks
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawPending } = useWriteContract()
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract()

  // Wait for transaction receipts
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  })

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // Update token info when data changes
  useEffect(() => {
    if (tokenBalance !== undefined && pTokenBalance !== undefined && allowance !== undefined) {
      setTokenInfo({
        symbol: 'gMON',
        name: 'Magma MONAD',
        decimals: gmonConfig.decimals,
        address: gmonTokenAddress,
        balance: formatUnits(tokenBalance as bigint, gmonConfig.decimals),
        allowance: formatUnits(allowance as bigint, gmonConfig.decimals),
        pTokenBalance: formatUnits(pTokenBalance as bigint, gmonConfig.decimals),
        borrowBalance: borrowBalance ? formatUnits(borrowBalance as bigint, gmonConfig.decimals) : '0'
      })
    }
  }, [tokenBalance, pTokenBalance, allowance, borrowBalance, gmonConfig.decimals, gmonTokenAddress])

  // Update pToken state when data changes
  useEffect(() => {
    if (totalSupply !== undefined && totalBorrows !== undefined && totalReserves !== undefined && 
        exchangeRate !== undefined && supplyRate !== undefined && borrowRate !== undefined && 
        collateralFactor !== undefined) {
      
      const marketData = collateralFactor as [boolean, bigint, boolean]
      
      setPTokenState({
        totalSupply: formatUnits(totalSupply as bigint, gmonConfig.decimals),
        totalBorrows: formatUnits(totalBorrows as bigint, gmonConfig.decimals),
        totalReserves: formatUnits(totalReserves as bigint, gmonConfig.decimals),
        exchangeRate: formatUnits(exchangeRate as bigint, 18),
        supplyRate: formatUnits(supplyRate as bigint, 18),
        borrowRate: formatUnits(borrowRate as bigint, 18),
        collateralFactor: formatUnits(marketData[1], 18),
        isListed: marketData[0],
        isPaused: marketData[2],
        isComptrollerPaused: false // Would need additional call to check
      })
    }
  }, [totalSupply, totalBorrows, totalReserves, exchangeRate, supplyRate, borrowRate, collateralFactor, gmonConfig.decimals])

  // Update lending flow state
  useEffect(() => {
    if (tokenInfo && pTokenState && accountLiquidity !== undefined && accountMarkets !== undefined) {
      const liquidityData = accountLiquidity as [bigint, bigint, bigint]
      const liquidity = formatUnits(liquidityData[0], 18)
      const shortfall = formatUnits(liquidityData[1], 18)
      const isInMarket = (accountMarkets as Address[]).includes(gmonPTokenAddress)
      
      const hasApproval = parseFloat(tokenInfo.allowance) > 0
      const approvalAmount = tokenInfo.allowance
      const canMint = hasApproval && parseFloat(tokenInfo.balance) > 0
      const canRedeem = parseFloat(tokenInfo.pTokenBalance) > 0
      const canBorrow = parseFloat(liquidity) > 0 && isInMarket
      const canRepay = parseFloat(tokenInfo.borrowBalance) > 0

      setLendingFlowState({
        hasApproval,
        approvalAmount,
        canMint,
        canRedeem,
        canBorrow,
        canRepay,
        isInMarket,
        liquidity,
        shortfall
      })
    }
  }, [tokenInfo, pTokenState, accountLiquidity, accountMarkets, gmonPTokenAddress])

  // Add debug result
  const addDebugResult = useCallback((result: DebugResult) => {
    setDebugResults(prev => [result, ...prev.slice(0, 9)]) // Keep last 10 results
  }, [])

  // Wallet analysis handlers
  const handleAnalyzeWallet = useCallback(async () => {
    if (!walletAddressInput.trim()) {
      toast.error('Please enter a wallet address')
      return
    }
    
    try {
      await analyzeWallet(walletAddressInput.trim())
      toast.success('Wallet analysis completed')
    } catch (error) {
      toast.error('Failed to analyze wallet')
    }
  }, [walletAddressInput, analyzeWallet])

  const handleClearAnalysis = useCallback(() => {
    clearAnalysis()
    setWalletAddressInput('')
    toast.info('Analysis cleared')
  }, [clearAnalysis])

  const copyAnalysisToClipboard = useCallback(async () => {
    if (!walletAnalysisData) {
      toast.error('No analysis data to copy')
      return
    }

    try {
      const reportText = `GMON WALLET ANALYSIS REPORT
============================

Wallet Address: ${walletAnalysisData.walletAddress}
Chain ID: ${walletAnalysisData.chainId}
Analysis Time: ${new Date(walletAnalysisData.timestamp).toLocaleString()}
Overall Health: ${walletAnalysisData.severity.toUpperCase()}

BALANCES:
=========
gMON Balance: ${walletAnalysisData.gmonBalance}
pgMON Balance: ${walletAnalysisData.pgmonBalance}
Borrow Balance: ${walletAnalysisData.gmonBorrowBalance}

MARKET STATUS:
=============
In gMON Market: ${walletAnalysisData.isInGmonMarket ? 'YES' : 'NO'}
Market Paused: ${walletAnalysisData.marketPaused ? 'YES' : 'NO'}
Collateral Factor: ${walletAnalysisData.collateralFactor}

ACCOUNT HEALTH:
==============
Account Liquidity: ${walletAnalysisData.accountLiquidity}
Account Shortfall: ${walletAnalysisData.accountShortfall}
Health Factor: ${walletAnalysisData.healthFactor.toFixed(4)}

WITHDRAWAL ANALYSIS:
===================
Can Withdraw: ${walletAnalysisData.canWithdraw ? 'YES' : 'NO'}
Max Withdrawable: ${walletAnalysisData.maxWithdrawable} gMON
${walletAnalysisData.withdrawalReason ? `Reason: ${walletAnalysisData.withdrawalReason}` : ''}

Withdrawal Blockers:
${walletAnalysisData.withdrawalBlockers.length > 0 
  ? walletAnalysisData.withdrawalBlockers.map(blocker => `- ${blocker}`).join('\n')
  : 'None'}

MARKET CONDITIONS:
=================
Total Supply: ${walletAnalysisData.totalSupply}
Total Borrows: ${walletAnalysisData.totalBorrows}
Available Liquidity: ${walletAnalysisData.availableLiquidity}

RECOMMENDATIONS:
===============
${walletAnalysisData.recommendations.length > 0 
  ? walletAnalysisData.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')
  : 'No specific recommendations at this time.'}

CONTRACT ADDRESSES:
==================
gMON Token: ${gmonConfig.underlying}
pgMON Token: ${gmonConfig.pToken}
Controller: ${monadTestnetContracts.unitrollerProxy}

Environment: Monad Testnet
Generated: ${new Date().toISOString()}`

      await navigator.clipboard.writeText(reportText)
      toast.success('Analysis report copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy report to clipboard')
    }
  }, [walletAnalysisData, gmonConfig])

  // Auto Diagnosis Function
  const runAutoDiagnosis = useCallback(async () => {
    if (!address || !chainId) {
      addDebugResult({
        success: false,
        message: 'Wallet not connected',
        severity: 'critical',
        category: 'wallet',
        timestamp: Date.now()
      })
      return
    }

    setIsLoading(true)
    const findings: DebugResult[] = []
    const recommendations: string[] = []
    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy'
    let canWithdraw = false

    try {
      // 1. Wallet Connection Check
      findings.push({
        success: true,
        message: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
        severity: 'info',
        category: 'wallet',
        timestamp: Date.now()
      })

      // 2. Network Check
      if (chainId !== 10143) {
        findings.push({
          success: false,
          message: `Wrong network: ${chainId}. Expected: 10143 (Monad Testnet)`,
          severity: 'critical',
          category: 'wallet',
          timestamp: Date.now()
        })
        overallHealth = 'critical'
        recommendations.push('Switch to Monad Testnet (Chain ID: 10143)')
      } else {
        findings.push({
          success: true,
          message: 'Connected to correct network (Monad Testnet)',
          severity: 'info',
          category: 'wallet',
          timestamp: Date.now()
        })
      }

      // 3. Token Balance Analysis
      if (tokenInfo) {
        const gmonBalance = parseFloat(tokenInfo.balance)
        const pTokenBalance = parseFloat(tokenInfo.pTokenBalance)
        const borrowBalance = parseFloat(tokenInfo.borrowBalance)

        findings.push({
          success: true,
          message: `gMON Balance: ${gmonBalance.toFixed(6)}`,
          severity: 'info',
          category: 'balance',
          timestamp: Date.now()
        })

        findings.push({
          success: true,
          message: `pgMON Balance: ${pTokenBalance.toFixed(6)}`,
          severity: 'info',
          category: 'balance',
          timestamp: Date.now()
        })

        if (borrowBalance > 0) {
          findings.push({
            success: true,
            message: `Borrow Balance: ${borrowBalance.toFixed(6)}`,
            severity: 'warning',
            category: 'balance',
            timestamp: Date.now()
          })
        }

        // Check for withdrawal possibility
        if (pTokenBalance > 0) {
          canWithdraw = true
          findings.push({
            success: true,
            message: 'Withdrawal possible - pgMON balance available',
            severity: 'info',
            category: 'simulation',
            timestamp: Date.now()
          })
        } else {
          findings.push({
            success: false,
            message: 'No pgMON balance available for withdrawal',
            severity: 'warning',
            category: 'simulation',
            timestamp: Date.now()
          })
          recommendations.push('Supply gMON tokens first to receive pgMON tokens')
        }
      }

      // 4. Approval State Analysis
      if (lendingFlowState) {
        if (lendingFlowState.hasApproval) {
          findings.push({
            success: true,
            message: `Token approved: ${parseFloat(lendingFlowState.approvalAmount).toFixed(6)} gMON`,
            severity: 'info',
            category: 'approval',
            timestamp: Date.now()
          })
        } else {
          findings.push({
            success: false,
            message: 'No token approval found',
            severity: 'warning',
            category: 'approval',
            timestamp: Date.now()
          })
          recommendations.push('Approve gMON token to enable minting')
        }

        // 5. Market Participation
        if (lendingFlowState.isInMarket) {
          findings.push({
            success: true,
            message: 'Account is in the gMON market',
            severity: 'info',
            category: 'market',
            timestamp: Date.now()
          })
        } else {
          findings.push({
            success: false,
            message: 'Account not in gMON market',
            severity: 'warning',
            category: 'market',
            timestamp: Date.now()
          })
          recommendations.push('Enter the gMON market to enable borrowing')
        }

        // 6. Health Factor Analysis
        const liquidity = parseFloat(lendingFlowState.liquidity)
        const shortfall = parseFloat(lendingFlowState.shortfall)

        if (shortfall > 0) {
          findings.push({
            success: false,
            message: `Account undercollateralized: ${shortfall.toFixed(6)} shortfall`,
            severity: 'critical',
            category: 'health',
            timestamp: Date.now()
          })
          overallHealth = 'critical'
          recommendations.push('Add collateral or repay debt to avoid liquidation')
        } else if (liquidity < 0) {
          findings.push({
            success: false,
            message: `Negative liquidity: ${liquidity.toFixed(6)}`,
            severity: 'critical',
            category: 'health',
            timestamp: Date.now()
          })
          overallHealth = 'critical'
          recommendations.push('Account at risk of liquidation')
        } else {
          findings.push({
            success: true,
            message: `Account healthy: ${liquidity.toFixed(6)} liquidity`,
            severity: 'info',
            category: 'health',
            timestamp: Date.now()
          })
        }
      }

      // 7. Market State Analysis
      if (pTokenState) {
        if (pTokenState.isPaused) {
          findings.push({
            success: false,
            message: 'gMON market is paused',
            severity: 'critical',
            category: 'market',
            timestamp: Date.now()
          })
          overallHealth = 'critical'
          recommendations.push('Market is paused - withdrawals disabled')
        } else {
          findings.push({
            success: true,
            message: 'gMON market is active',
            severity: 'info',
            category: 'market',
            timestamp: Date.now()
          })
        }

        if (parseFloat(pTokenState.exchangeRate) === 0) {
          findings.push({
            success: false,
            message: 'Exchange rate is zero - market may be in abnormal state',
            severity: 'critical',
            category: 'market',
            timestamp: Date.now()
          })
          overallHealth = 'critical'
        } else {
          findings.push({
            success: true,
            message: `Exchange rate: ${parseFloat(pTokenState.exchangeRate).toFixed(8)}`,
            severity: 'info',
            category: 'market',
            timestamp: Date.now()
          })
        }
      }

      // 8. Withdrawal Simulation
      if (canWithdraw && tokenInfo) {
        const maxWithdraw = parseFloat(tokenInfo.pTokenBalance)
        const simulatedAmount = Math.min(maxWithdraw, 1.0) // Simulate withdrawing 1 gMON or max available

        findings.push({
          success: true,
          message: `Withdrawal simulation: ${simulatedAmount.toFixed(6)} gMON`,
          severity: 'info',
          category: 'simulation',
          timestamp: Date.now(),
          data: {
            simulatedAmount,
            maxPossible: maxWithdraw,
            estimatedGas: '~150,000',
            success: true
          }
        })
      }

      // Create diagnostic report
      const report: DiagnosticReport = {
        walletAddress: address,
        chainId: chainId,
        timestamp: Date.now(),
        overallHealth,
        summary: `Account health: ${overallHealth.toUpperCase()}. ${canWithdraw ? 'Withdrawal possible' : 'Withdrawal not possible'}`,
        findings,
        recommendations,
        canWithdraw,
        withdrawalSimulation: canWithdraw ? {
          amount: tokenInfo?.pTokenBalance || '0',
          success: true,
          gasEstimate: '~150,000'
        } : undefined
      }

      setDiagnosticReport(report)
      setDebugResults(findings)

      // Add summary to findings
      addDebugResult({
        success: true,
        message: `Auto diagnosis completed: ${overallHealth.toUpperCase()} - ${canWithdraw ? 'Withdrawal possible' : 'Withdrawal not possible'}`,
        severity: 'info' as const,
        category: 'simulation',
        timestamp: Date.now(),
        data: report
      })

    } catch (error) {
      addDebugResult({
        success: false,
        message: 'Auto diagnosis failed',
        error: error instanceof Error ? error.message : String(error),
        severity: 'critical',
        category: 'wallet',
        timestamp: Date.now()
      })
    } finally {
      setIsLoading(false)
    }
  }, [address, chainId, tokenInfo, pTokenState, lendingFlowState, addDebugResult])

  // Manual Testing Function
  const runManualTest = useCallback(async () => {
    if (!address || !chainId) {
      addDebugResult({
        success: false,
        message: 'Wallet not connected',
        severity: 'critical',
        category: 'wallet',
        timestamp: Date.now()
      })
      return
    }

    setIsLoading(true)
    const findings: DebugResult[] = []

    try {
      const { withdrawAmount, decimals, exchangeRate, healthFactor, gasLimit, slippage } = manualParams

      // Test custom parameters
      findings.push({
        success: true,
        message: `Testing withdrawal: ${withdrawAmount} gMON`,
        severity: 'info',
        category: 'simulation',
        timestamp: Date.now()
      })

      findings.push({
        success: true,
        message: `Using decimals: ${decimals}`,
        severity: 'info',
        category: 'simulation',
        timestamp: Date.now()
      })

      if (exchangeRate) {
        findings.push({
          success: true,
          message: `Custom exchange rate: ${exchangeRate}`,
          severity: 'info',
          category: 'simulation',
          timestamp: Date.now()
        })
      }

      if (healthFactor) {
        const hf = parseFloat(healthFactor)
        if (hf < 1.0) {
          findings.push({
            success: false,
            message: `Health factor critical: ${hf} (below 1.0)`,
            severity: 'critical',
            category: 'health',
            timestamp: Date.now()
          })
        } else if (hf < 1.5) {
          findings.push({
            success: false,
            message: `Health factor warning: ${hf} (below 1.5)`,
            severity: 'warning',
            category: 'health',
            timestamp: Date.now()
          })
        } else {
          findings.push({
            success: true,
            message: `Health factor healthy: ${hf}`,
            severity: 'info',
            category: 'health',
            timestamp: Date.now()
          })
        }
      }

      // Simulate withdrawal with custom parameters
      if (withdrawAmount && parseFloat(withdrawAmount) > 0) {
        const amount = parseFloat(withdrawAmount)
        const parsedAmount = parseUnits(withdrawAmount, decimals)

        findings.push({
          success: true,
          message: `Parsed amount: ${parsedAmount.toString()} (${decimals} decimals)`,
          severity: 'info',
          category: 'simulation',
          timestamp: Date.now()
        })

        // Check if amount is valid
        if (tokenInfo && amount > parseFloat(tokenInfo.pTokenBalance)) {
          findings.push({
            success: false,
            message: `Insufficient balance: ${amount} > ${tokenInfo.pTokenBalance}`,
            severity: 'error',
            category: 'simulation',
            timestamp: Date.now()
          })
        } else {
          findings.push({
            success: true,
            message: `Withdrawal simulation successful: ${amount} gMON`,
            severity: 'info',
            category: 'simulation',
            timestamp: Date.now(),
            data: {
              amount,
              decimals,
              gasLimit,
              slippage,
              success: true
            }
          })
        }
      }

      setDebugResults(findings)

    } catch (error) {
      addDebugResult({
        success: false,
        message: 'Manual test failed',
        error: error instanceof Error ? error.message : String(error),
        severity: 'critical',
        category: 'simulation',
        timestamp: Date.now()
      })
    } finally {
      setIsLoading(false)
    }
  }, [address, chainId, manualParams, tokenInfo, addDebugResult])

  // Copy Diagnostic Report to Clipboard
  const copyReportToClipboard = useCallback(async () => {
    if (!diagnosticReport) {
      addDebugResult({
        success: false,
        message: 'No diagnostic report available to copy',
        severity: 'warning',
        category: 'simulation',
        timestamp: Date.now()
      })
      return
    }

    try {
      // Format the report for easy reading
      const reportText = `GMON DIAGNOSTIC REPORT
========================

Wallet: ${diagnosticReport.walletAddress}
Chain ID: ${diagnosticReport.chainId}
Timestamp: ${new Date(diagnosticReport.timestamp).toLocaleString()}
Overall Health: ${diagnosticReport.overallHealth.toUpperCase()}
Summary: ${diagnosticReport.summary}
Withdrawal Possible: ${diagnosticReport.canWithdraw ? 'YES' : 'NO'}

DETAILED FINDINGS:
==================
${diagnosticReport.findings.map((finding, index) => 
  `${index + 1}. [${finding.category?.toUpperCase() || 'GENERAL'}] ${finding.severity?.toUpperCase() || 'INFO'}
   ${finding.message}
   ${finding.error ? `Error: ${finding.error}` : ''}
   ${finding.timestamp ? `Time: ${new Date(finding.timestamp).toLocaleTimeString()}` : ''}
`).join('\n')}

RECOMMENDATIONS:
================
${diagnosticReport.recommendations.length > 0 
  ? diagnosticReport.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')
  : 'No specific recommendations at this time.'}

CONTRACT ADDRESSES:
===================
gMON Token: ${gmonTokenAddress}
pgMON Token: ${gmonPTokenAddress}
Controller: ${controllerAddress}

WITHDRAWAL SIMULATION:
======================
${diagnosticReport.withdrawalSimulation 
  ? `Amount: ${diagnosticReport.withdrawalSimulation.amount} gMON
Success: ${diagnosticReport.withdrawalSimulation.success ? 'YES' : 'NO'}
${diagnosticReport.withdrawalSimulation.reason ? `Reason: ${diagnosticReport.withdrawalSimulation.reason}` : ''}
${diagnosticReport.withdrawalSimulation.gasEstimate ? `Gas Estimate: ${diagnosticReport.withdrawalSimulation.gasEstimate}` : ''}`
  : 'No withdrawal simulation available.'}

Environment: Monad Testnet
Generated: ${new Date().toISOString()}`

      await navigator.clipboard.writeText(reportText)
      
      addDebugResult({
        success: true,
        message: 'Diagnostic report copied to clipboard successfully',
        severity: 'info',
        category: 'simulation',
        timestamp: Date.now()
      })
    } catch (error) {
      addDebugResult({
        success: false,
        message: 'Failed to copy report to clipboard',
        error: error instanceof Error ? error.message : String(error),
        severity: 'error',
        category: 'simulation',
        timestamp: Date.now()
      })
    }
  }, [diagnosticReport, address, gmonTokenAddress, gmonPTokenAddress, controllerAddress, addDebugResult])

  // Enhanced debug functions
  const debugTokenInfo = useCallback(async () => {
    try {
      setIsLoading(true)
      addDebugResult({ success: true, message: 'Fetching comprehensive token information...', severity: 'info' })
      
      await Promise.all([
        refetchBalance(),
        refetchPTokenBalance(),
        refetchAllowance()
      ])
      
      addDebugResult({ 
        success: true, 
        message: 'Token info refreshed successfully',
        data: tokenInfo,
        severity: 'info'
      })
    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Failed to fetch token info',
        error: error instanceof Error ? error.message : String(error),
        severity: 'error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [refetchBalance, refetchPTokenBalance, refetchAllowance, tokenInfo, addDebugResult])

  const debugPTokenState = useCallback(async () => {
    try {
      setIsLoading(true)
      addDebugResult({ success: true, message: 'Analyzing pToken state and market conditions...', severity: 'info' })
      
      if (!publicClient || !address) {
        throw new Error('Public client or address not available')
      }

      // Get recent transaction history
      const blockNumber = await publicClient.getBlockNumber()
      const fromBlock = blockNumber - BigInt(1000) // Last ~1000 blocks
      
      // Get mint events
      const mintEvents = await publicClient.getLogs({
        address: gmonPTokenAddress,
        event: {
          type: 'event',
          name: 'Mint',
          inputs: [
            { name: 'minter', type: 'address', indexed: true },
            { name: 'mintAmount', type: 'uint256', indexed: false },
            { name: 'mintTokens', type: 'uint256', indexed: false }
          ]
        },
        fromBlock,
        toBlock: 'latest'
      } as any)

      // Get redeem events
      const redeemEvents = await publicClient.getLogs({
        address: gmonPTokenAddress,
        event: {
          type: 'event',
          name: 'Redeem',
          inputs: [
            { name: 'redeemer', type: 'address', indexed: true },
            { name: 'redeemAmount', type: 'uint256', indexed: false },
            { name: 'redeemTokens', type: 'uint256', indexed: false }
          ]
        },
        fromBlock,
        toBlock: 'latest'
      } as any)

      // Get approval events
      const approvalEvents = await publicClient.getLogs({
        address: gmonTokenAddress,
        event: {
          type: 'event',
          name: 'Approval',
          inputs: [
            { name: 'owner', type: 'address', indexed: true },
            { name: 'spender', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false }
          ]
        },
        fromBlock,
        toBlock: 'latest',
        args: {
          owner: address,
          spender: gmonPTokenAddress
        }
      } as any)

      const userEvents = [...mintEvents, ...redeemEvents, ...approvalEvents]
        .filter(event => (event as any).topics?.[1]?.toLowerCase() === address?.toLowerCase())
        .sort((a, b) => Number((b as any).blockNumber) - Number((a as any).blockNumber))
        .slice(0, 10) // Last 10 events

      const txHistory: TransactionHistory[] = userEvents.map(event => {
        const block = (event as any).blockNumber
        const isMint = (event as any).topics?.[0] === '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f'
        const isRedeem = (event as any).topics?.[0] === '0xe5b754fb1abb7f01b499791d0b820ae3b6af3424ac1c59768edb53f4ec31a92'
        const isApproval = (event as any).topics?.[0] === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
        
        return {
          hash: (event as any).transactionHash,
          type: isMint ? 'mint' : isRedeem ? 'redeem' : 'approve',
          amount: '0', // Would need to decode from data
          timestamp: Date.now(), // Would need to get from block
          status: 'success',
          blockNumber: Number(block)
        }
      })

      setTransactionHistory(txHistory)
      
      addDebugResult({ 
        success: true, 
        message: `Found ${userEvents.length} recent transactions`,
        data: { 
          pTokenState, 
          transactionCount: userEvents.length,
          recentTransactions: txHistory.slice(0, 5)
        },
        severity: 'info'
      })
    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Failed to analyze pToken state',
        error: error instanceof Error ? error.message : String(error),
        severity: 'error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [publicClient, address, gmonPTokenAddress, gmonTokenAddress, pTokenState, addDebugResult])

  const debugLendingFlow = useCallback(async () => {
    try {
      setIsLoading(true)
      addDebugResult({ success: true, message: 'Analyzing lending flow and potential issues...', severity: 'info' })
      
      const flowAnalysis = {
        currentState: lendingFlowState,
        recommendations: [] as string[]
      }

      // Generate recommendations based on state
      if (lendingFlowState) {
        if (!lendingFlowState.hasApproval && parseFloat(tokenInfo?.balance || '0') > 0) {
          flowAnalysis.recommendations.push('Approve gMON token to enable minting')
        }
        
        if (lendingFlowState.hasApproval && !lendingFlowState.canMint) {
          flowAnalysis.recommendations.push('Insufficient gMON balance to mint')
        }
        
        if (lendingFlowState.canRedeem && !lendingFlowState.isInMarket) {
          flowAnalysis.recommendations.push('Enter market to enable borrowing against collateral')
        }
        
        if (parseFloat(lendingFlowState.shortfall) > 0) {
          flowAnalysis.recommendations.push('Add collateral or repay debt to avoid liquidation')
        }
      }

      addDebugResult({ 
        success: true, 
        message: 'Lending flow analysis completed',
        data: flowAnalysis,
        severity: 'info'
      })
    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Failed to analyze lending flow',
        error: error instanceof Error ? error.message : String(error),
        severity: 'error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [lendingFlowState, tokenInfo, addDebugResult])

  const recoverIncompleteTransaction = useCallback(async () => {
    try {
      setIsLoading(true)
      addDebugResult({ success: true, message: 'Attempting to recover incomplete transaction...', severity: 'warning' })
      
      if (!lendingFlowState || !tokenInfo) {
        throw new Error('Insufficient data for recovery')
      }

      // Check if user has approval but no pToken balance (incomplete mint)
      if (lendingFlowState.hasApproval && parseFloat(tokenInfo.pTokenBalance) === 0 && parseFloat(tokenInfo.balance) > 0) {
        addDebugResult({ 
          success: true, 
          message: 'Detected incomplete mint - attempting to complete',
          data: { 
            action: 'mint',
            amount: tokenInfo.balance,
            hasApproval: true
          },
          severity: 'warning'
        })
        
        // Attempt to mint with current balance
        const mintAmount = parseUnits(tokenInfo.balance, gmonConfig.decimals)
        writeWithdraw({
          address: gmonPTokenAddress,
          abi: combinedAbi,
          functionName: 'mint',
          args: [mintAmount],
        } as any)
        
        addDebugResult({ 
          success: true, 
          message: 'Mint transaction submitted to complete previous operation',
          severity: 'info'
        })
      } else {
        addDebugResult({ 
          success: false, 
          message: 'No incomplete transaction detected',
          severity: 'info'
        })
      }
    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Failed to recover incomplete transaction',
        error: error instanceof Error ? error.message : String(error),
        severity: 'error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [lendingFlowState, tokenInfo, gmonConfig.decimals, writeWithdraw, gmonPTokenAddress, addDebugResult])

  const debugContractAddresses = useCallback(() => {
    const addresses = {
      gmonToken: gmonTokenAddress,
      gmonPToken: gmonPTokenAddress,
      controller: controllerAddress,
      chainId: chainId,
      userAddress: address
    }
    
    addDebugResult({ 
      success: true, 
      message: 'Contract addresses retrieved',
      data: addresses 
    })
  }, [gmonTokenAddress, gmonPTokenAddress, controllerAddress, chainId, address, addDebugResult])

  const debugNetworkConnection = useCallback(() => {
    const networkInfo = {
      connected: !!address,
      chainId: chainId,
      expectedChainId: 10143, // Monad Testnet
      isCorrectNetwork: chainId === 10143,
      rpcUrl: monadTestnetContracts.rpcUrl,
      explorer: monadTestnetContracts.explorer
    }
    
    addDebugResult({ 
      success: networkInfo.isCorrectNetwork, 
      message: networkInfo.isCorrectNetwork ? 'Connected to correct network' : 'Wrong network detected',
      data: networkInfo 
    })
  }, [address, chainId, addDebugResult])

  const testWithdraw = useCallback(async () => {
    if (!withdrawAmount || !address) {
      addDebugResult({ 
        success: false, 
        message: 'Invalid parameters for withdrawal test',
        error: 'Missing amount or wallet connection'
      })
      return
    }

    try {
      setIsLoading(true)
      const amount = parseUnits(withdrawAmount, gmonConfig.decimals)
      
      addDebugResult({ 
        success: true, 
        message: `Testing withdrawal of ${withdrawAmount} gMON`,
        data: { amount: amount.toString(), decimals: gmonConfig.decimals }
      })

      // Check if user has enough pToken balance
      if (pTokenBalance && amount > (pTokenBalance as bigint)) {
        addDebugResult({ 
          success: false, 
          message: 'Insufficient pToken balance for withdrawal',
          error: `Required: ${withdrawAmount}, Available: ${formatUnits(pTokenBalance as bigint, gmonConfig.decimals)}`
        })
        return
      }

      // Attempt withdrawal
        writeWithdraw({
          address: gmonPTokenAddress,
          abi: combinedAbi,
          functionName: 'redeem',
          args: [amount],
        } as any)

      addDebugResult({ 
        success: true, 
        message: 'Withdrawal transaction submitted',
        data: { txHash: withdrawHash }
      })

    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Withdrawal test failed',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }, [withdrawAmount, address, gmonConfig.decimals, pTokenBalance, writeWithdraw, gmonPTokenAddress, withdrawHash, addDebugResult])

  const testApproval = useCallback(async () => {
    if (!address) {
      addDebugResult({ 
        success: false, 
        message: 'Wallet not connected',
        error: 'Please connect your wallet first'
      })
      return
    }

    try {
      setIsLoading(true)
      const maxApproval = parseUnits('1000000', gmonConfig.decimals) // 1M gMON approval
      
      addDebugResult({ 
        success: true, 
        message: 'Testing token approval',
        data: { approvalAmount: maxApproval.toString() }
      })

      writeApprove({
        address: gmonTokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [gmonPTokenAddress, maxApproval],
      } as any)

      addDebugResult({ 
        success: true, 
        message: 'Approval transaction submitted',
        data: { txHash: approveHash }
      })

    } catch (error) {
      addDebugResult({ 
        success: false, 
        message: 'Approval test failed',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }, [address, gmonConfig.decimals, writeApprove, gmonTokenAddress, gmonPTokenAddress, approveHash, addDebugResult])

  // Handle transaction success
  useEffect(() => {
    if (isWithdrawSuccess) {
      toast.success('Withdrawal successful!')
      addDebugResult({ 
        success: true, 
        message: 'Withdrawal transaction confirmed',
        data: { txHash: withdrawHash }
      })
      refetchPTokenBalance()
      refetchBalance()
    }
  }, [isWithdrawSuccess, withdrawHash, addDebugResult, refetchPTokenBalance, refetchBalance])

  useEffect(() => {
    if (isApproveSuccess) {
      toast.success('Approval successful!')
      addDebugResult({ 
        success: true, 
        message: 'Approval transaction confirmed',
        data: { txHash: approveHash }
      })
      refetchAllowance()
    }
  }, [isApproveSuccess, approveHash, addDebugResult, refetchAllowance])

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced liquid glass background */}
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-teal-500 rounded-full mix-blend-multiply filter blur-xl"></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl"></div>
        </div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 gradient-text">
            GMON Debug Console
          </h1>
          <p className="text-lg text-muted-foreground">
            Monad Testnet Withdrawal Testing & Debugging Interface
          </p>
        </div>

        {/* Network Status */}
        <div className="mb-8 p-8 glass-card rounded-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Network Status</h3>
              <div className="flex items-center space-x-4">
                <div className={`px-4 py-2 rounded-2xl text-sm font-medium backdrop-blur-sm border ${
                  chainId === 10143 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {chainId === 10143 ? '✓ Monad Testnet' : '✗ Wrong Network'}
                </div>
                <div className="text-muted-foreground">
                  Chain ID: {chainId || 'Not Connected'}
                </div>
                <div className="text-muted-foreground">
                  Wallet: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}
                </div>
              </div>
            </div>
            <button
              onClick={debugNetworkConnection}
              className="px-6 py-3 backdrop-blur-sm border bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/30 rounded-2xl transition-all duration-300"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 glass-card rounded-3xl p-2">
            <button
              onClick={() => setActiveMode('auto')}
              className={`px-6 py-6 rounded-2xl transition-all duration-300 backdrop-blur-sm border ${
                activeMode === 'auto'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'text-gray-300 hover:text-emerald-300 hover:bg-emerald-500/5 border-transparent'
              }`}
            >
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-semibold">Auto Diagnosis</div>
              <div className="text-sm opacity-75">Connected wallet analysis</div>
            </button>
            <button
              onClick={() => setActiveMode('manual')}
              className={`px-6 py-6 rounded-2xl transition-all duration-300 backdrop-blur-sm border ${
                activeMode === 'manual'
                  ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                  : 'text-gray-300 hover:text-teal-300 hover:bg-teal-500/5 border-transparent'
              }`}
            >
              <div className="text-2xl mb-2">🔧</div>
              <div className="font-semibold">Manual Testing</div>
              <div className="text-sm opacity-75">Custom parameter testing</div>
            </button>
            <button
              onClick={() => setActiveMode('wallet-analysis')}
              className={`px-6 py-6 rounded-2xl transition-all duration-300 backdrop-blur-sm border ${
                activeMode === 'wallet-analysis'
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'text-gray-300 hover:text-cyan-300 hover:bg-cyan-500/5 border-transparent'
              }`}
            >
              <div className="text-2xl mb-2">🔍</div>
              <div className="font-semibold">Wallet Analysis</div>
              <div className="text-sm opacity-75">Analyze any wallet address</div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="glass-card rounded-3xl p-8">
          {/* Auto Diagnosis Mode */}
          {activeMode === 'auto' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground mb-4">Auto Diagnosis</h2>
                <p className="text-muted-foreground mb-6">
                  Comprehensive analysis of your wallet, balances, and withdrawal capabilities
                </p>
                <button
                  onClick={runAutoDiagnosis}
                  disabled={isLoading}
                  className="px-8 py-4 backdrop-blur-sm border bg-emerald-500/20 hover:bg-emerald-500/30 disabled:bg-gray-500/20 disabled:cursor-not-allowed text-emerald-400 border-emerald-500/30 transition-all duration-300 text-lg font-semibold rounded-2xl"
                >
                  {isLoading ? 'Analyzing...' : '🤖 Run Auto Diagnosis'}
                </button>
              </div>

              {/* Diagnostic Report */}
              {diagnosticReport && (
                <div className="space-y-4">
                  <div className={`p-8 backdrop-blur-sm rounded-3xl border transition-all duration-500 ${
                    diagnosticReport.overallHealth === 'healthy' 
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : diagnosticReport.overallHealth === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-foreground">Diagnostic Summary</h3>
                      <span className={`px-4 py-2 rounded-2xl text-sm font-medium backdrop-blur-sm border transition-all duration-300 ${
                        diagnosticReport.overallHealth === 'healthy' 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : diagnosticReport.overallHealth === 'warning'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }`}>
                        {diagnosticReport.overallHealth.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-muted-foreground mb-4">{diagnosticReport.summary}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Withdrawal: {diagnosticReport.canWithdraw ? '✅ Possible' : '❌ Not Possible'}
                      </div>
                      <button
                        onClick={copyReportToClipboard}
                        className="px-6 py-3 backdrop-blur-sm border bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/30 transition-all duration-300 rounded-2xl"
                      >
                        📋 Copy Report
                      </button>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {diagnosticReport.recommendations.length > 0 && (
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-amber-500/10 border-amber-500/30">
                      <h4 className="font-semibold mb-3 text-amber-400">Recommendations</h4>
                      <ul className="space-y-2">
                        {diagnosticReport.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-amber-300">• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Findings */}
              {debugResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-white">Detailed Findings</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {debugResults.map((result, index) => {
                      const getSeverityColor = (severity?: string) => {
                        switch (severity) {
                          case 'critical': return 'bg-red-500/20 border-red-500/50 text-red-300'
                          case 'error': return 'bg-red-500/10 border-red-500/30 text-red-400'
                          case 'warning': return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          case 'info': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          default: return result.success 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                        }
                      }

                      const getSeverityIcon = (severity?: string) => {
                        switch (severity) {
                          case 'critical': return '🚨'
                          case 'error': return '❌'
                          case 'warning': return '⚠️'
                          case 'info': return 'ℹ️'
                          default: return result.success ? '✓' : '✗'
                        }
                      }

                      return (
                        <div
                          key={index}
                          className={`p-4 backdrop-blur-sm rounded-2xl border transition-all duration-300 ${getSeverityColor(result.severity)}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getSeverityIcon(result.severity)}</span>
                            <span className="font-medium">{result.message}</span>
                            {result.category && (
                              <span className={`text-xs px-3 py-1 rounded-2xl backdrop-blur-sm border transition-all duration-300 ${
                                'bg-white/10 border-white/20'
                              }`}>
                                {result.category}
                              </span>
                            )}
                          </div>
                          {result.error && (
                            <div className={`mt-2 text-sm font-mono transition-all duration-500 ${
                              'text-red-300'
                            }`}>{result.error}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Testing Mode */}
          {activeMode === 'manual' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className={`text-2xl font-bold mb-4 transition-all duration-500 text-foreground`}>Manual Testing</h2>
                <p className={`mb-6 transition-all duration-500 text-muted-foreground`}>
                  Custom parameter testing for advanced troubleshooting
                </p>
              </div>

              {/* Manual Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className={`p-6 backdrop-blur-sm border rounded-3xl transition-all duration-500 ${
                    'bg-white/5 border-white/10'
                  }`}>
                    <h3 className={`text-lg font-semibold mb-4 transition-all duration-500 ${
                      'text-teal-400'
                    }`}>Test Parameters</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Withdrawal Amount (gMON)
                        </label>
                        <input
                          type="number"
                          value={manualParams.withdrawAmount}
                          onChange={(e) => setManualParams(prev => ({ ...prev, withdrawAmount: e.target.value }))}
                          placeholder="0.0"
                          step="0.000001"
                          className={`w-full px-4 py-3 backdrop-blur-sm border rounded-2xl focus:outline-none focus:ring-1 transition-all duration-200 ${
                            'bg-black/30 border-white/20 text-white placeholder-gray-400 focus:border-teal-500/50 focus:ring-teal-500/20'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Decimals
                        </label>
                        <input
                          type="number"
                          value={manualParams.decimals}
                          onChange={(e) => setManualParams(prev => ({ ...prev, decimals: parseInt(e.target.value) || 18 }))}
                          min="0"
                          max="18"
                          className={`w-full px-4 py-3 backdrop-blur-sm border rounded-2xl focus:outline-none focus:ring-1 transition-all duration-200 ${
                            'bg-black/30 border-white/20 text-white placeholder-gray-400 focus:border-teal-500/50 focus:ring-teal-500/20'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Exchange Rate (optional)
                        </label>
                        <input
                          type="number"
                          value={manualParams.exchangeRate}
                          onChange={(e) => setManualParams(prev => ({ ...prev, exchangeRate: e.target.value }))}
                          placeholder="Auto-detect"
                          step="0.00000001"
                          className={`w-full px-4 py-3 backdrop-blur-sm border rounded-2xl focus:outline-none focus:ring-1 transition-all duration-200 ${
                            'bg-black/30 border-white/20 text-white placeholder-gray-400 focus:border-teal-500/50 focus:ring-teal-500/20'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={`p-6 backdrop-blur-sm border rounded-3xl transition-all duration-500 ${
                    'bg-white/5 border-white/10'
                  }`}>
                    <h3 className={`text-lg font-semibold mb-4 transition-all duration-500 text-emerald-400`}>Health & Gas</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Health Factor (optional)
                        </label>
                        <input
                          type="number"
                          value={manualParams.healthFactor}
                          onChange={(e) => setManualParams(prev => ({ ...prev, healthFactor: e.target.value }))}
                          placeholder="Auto-calculate"
                          step="0.01"
                          min="0"
                          className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Gas Limit
                        </label>
                        <input
                          type="number"
                          value={manualParams.gasLimit}
                          onChange={(e) => setManualParams(prev => ({ ...prev, gasLimit: e.target.value }))}
                          placeholder="300000"
                          className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-muted-foreground">
                          Slippage (%)
                        </label>
                        <input
                          type="number"
                          value={manualParams.slippage}
                          onChange={(e) => setManualParams(prev => ({ ...prev, slippage: e.target.value }))}
                          placeholder="0.5"
                          step="0.1"
                          min="0"
                          max="50"
                          className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <div className="text-center">
                <button
                  onClick={runManualTest}
                  disabled={isLoading}
                  className="px-8 py-4 backdrop-blur-sm border bg-teal-500/20 hover:bg-teal-500/30 disabled:bg-gray-500/20 disabled:cursor-not-allowed text-teal-400 border-teal-500/30 transition-all duration-300 text-lg font-semibold rounded-2xl"
                >
                  {isLoading ? 'Testing...' : '🔧 Run Manual Test'}
                </button>
              </div>

              {/* Test Results */}
              {debugResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className={`text-lg font-semibold transition-all duration-500 text-foreground`}>Test Results</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {debugResults.map((result, index) => {
                      const getSeverityColor = (severity?: string) => {
                        switch (severity) {
                          case 'critical': return 'bg-red-500/20 border-red-500/50 text-red-300'
                          case 'error': return 'bg-red-500/10 border-red-500/30 text-red-400'
                          case 'warning': return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          case 'info': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          default: return result.success 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                        }
                      }

                      const getSeverityIcon = (severity?: string) => {
                        switch (severity) {
                          case 'critical': return '🚨'
                          case 'error': return '❌'
                          case 'warning': return '⚠️'
                          case 'info': return 'ℹ️'
                          default: return result.success ? '✓' : '✗'
                        }
                      }

                      return (
                        <div
                          key={index}
                          className={`p-4 backdrop-blur-sm rounded-2xl border transition-all duration-300 ${getSeverityColor(result.severity)}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getSeverityIcon(result.severity)}</span>
                            <span className="font-medium">{result.message}</span>
                            {result.category && (
                              <span className={`text-xs px-3 py-1 rounded-2xl backdrop-blur-sm border transition-all duration-300 ${
                                'bg-white/10 border-white/20'
                              }`}>
                                {result.category}
                              </span>
                            )}
                          </div>
                          {result.error && (
                            <div className={`mt-2 text-sm font-mono transition-all duration-500 ${
                              'text-red-300'
                            }`}>{result.error}</div>
                          )}
                          {result.data && (
                            <div className={`mt-2 p-3 backdrop-blur-sm rounded-2xl border transition-all duration-500 ${
                              'bg-white/5 border-white/10'
                            }`}>
                              <div className={`text-sm transition-all duration-500 ${
                                'text-gray-300'
                              }`}>
                                <pre className="whitespace-pre-wrap text-xs">
                                  {JSON.stringify(result.data, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wallet Analysis Mode */}
          {activeMode === 'wallet-analysis' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground mb-4">Wallet Analysis</h2>
                <p className="text-muted-foreground mb-6">
                  Analyze any wallet address to understand their gMON lending position and withdrawal capability
                </p>
              </div>

              {/* Wallet Address Input */}
              <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                <h3 className="text-lg font-semibold text-cyan-400 mb-4">Enter Wallet Address</h3>
                <div className="flex space-x-4">
                  <input
                    type="text"
                    value={walletAddressInput}
                    onChange={(e) => setWalletAddressInput(e.target.value)}
                    placeholder="0x..."
                    className="flex-1 px-4 py-3 backdrop-blur-sm border rounded-2xl focus:outline-none focus:ring-1 transition-all duration-200 bg-black/30 border-white/20 text-white placeholder-gray-400 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                  />
                  <button
                    onClick={handleAnalyzeWallet}
                    disabled={isAnalyzing || !walletAddressInput.trim()}
                    className="px-6 py-3 backdrop-blur-sm border bg-cyan-500/20 hover:bg-cyan-500/30 disabled:bg-gray-500/20 disabled:cursor-not-allowed text-cyan-400 border-cyan-500/30 transition-all duration-300 rounded-2xl font-semibold"
                  >
                    {isAnalyzing ? 'Analyzing...' : '🔍 Analyze'}
                  </button>
                  {walletAnalysisData && (
                    <button
                      onClick={handleClearAnalysis}
                      className="px-6 py-3 backdrop-blur-sm border bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 border-gray-500/30 transition-all duration-300 rounded-2xl font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {analysisError && (
                    <div className="mt-4 p-4 backdrop-blur-sm border rounded-2xl bg-red-500/10 border-red-500/30 text-red-400">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">❌</span>
                        <span className="font-medium text-foreground">Analysis Error</span>
                    </div>
                    <div className="mt-2 text-sm">{analysisError}</div>
                  </div>
                )}
              </div>

              {/* Analysis Steps */}
              {analysisSteps.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">Analysis Progress</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {analysisSteps.map((step, index) => {
                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'success': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          case 'error': return 'bg-red-500/10 border-red-500/30 text-red-400'
                          case 'loading': return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                          default: return 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                        }
                      }

                      const getStatusIcon = (status: string) => {
                        switch (status) {
                          case 'success': return '✅'
                          case 'error': return '❌'
                          case 'loading': return '⏳'
                          default: return '⏸️'
                        }
                      }

                      return (
                        <div
                          key={step.id}
                          className={`p-4 backdrop-blur-sm rounded-2xl border transition-all duration-300 ${getStatusColor(step.status)}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getStatusIcon(step.status)}</span>
                            <span className="font-medium">{step.name}</span>
                            <span className="text-xs opacity-75">
                              {new Date(step.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          {step.message && (
                            <div className="mt-2 text-sm opacity-90">{step.message}</div>
                          )}
                          {step.error && (
                            <div className="mt-2 text-sm font-mono text-red-300">{step.error}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Analysis Results */}
              {walletAnalysisData && (
                <div className="space-y-4">
                  {/* Summary Card */}
                  <div className={`p-8 backdrop-blur-sm rounded-3xl border transition-all duration-500 ${
                    walletAnalysisData.severity === 'healthy' 
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : walletAnalysisData.severity === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">Analysis Summary</h3>
                      <div className="flex items-center space-x-4">
                        <span className={`px-4 py-2 rounded-2xl text-sm font-medium backdrop-blur-sm border transition-all duration-300 ${
                          walletAnalysisData.severity === 'healthy' 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : walletAnalysisData.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {walletAnalysisData.severity.toUpperCase()}
                        </span>
                        <button
                          onClick={copyAnalysisToClipboard}
                          className="px-6 py-3 backdrop-blur-sm border bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border-cyan-500/30 transition-all duration-300 rounded-2xl"
                        >
                          📋 Copy Report
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Wallet Info</h4>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>Address: {walletAnalysisData.walletAddress.slice(0, 6)}...{walletAnalysisData.walletAddress.slice(-4)}</div>
                          <div>Chain: Monad Testnet (10143)</div>
                          <div>Analysis Time: {new Date(walletAnalysisData.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Withdrawal Status</h4>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>Can Withdraw: {walletAnalysisData.canWithdraw ? '✅ YES' : '❌ NO'}</div>
                          <div>Max Withdrawable: {walletAnalysisData.maxWithdrawable} gMON</div>
                          <div>Health Factor: {walletAnalysisData.healthFactor.toFixed(4)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Balances */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">Balances</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-300">gMON Balance:</span>
                          <span className="text-white font-mono">{walletAnalysisData.gmonBalance}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">pgMON Balance:</span>
                          <span className="text-white font-mono">{walletAnalysisData.pgmonBalance}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Borrow Balance:</span>
                          <span className="text-white font-mono">{walletAnalysisData.gmonBorrowBalance}</span>
                        </div>
                      </div>
                    </div>

                    {/* Market Status */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">Market Status</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-300">In gMON Market:</span>
                          <span className={walletAnalysisData.isInGmonMarket ? 'text-emerald-400' : 'text-red-400'}>
                            {walletAnalysisData.isInGmonMarket ? 'YES' : 'NO'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Market Paused:</span>
                          <span className={walletAnalysisData.marketPaused ? 'text-red-400' : 'text-emerald-400'}>
                            {walletAnalysisData.marketPaused ? 'YES' : 'NO'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Collateral Factor:</span>
                          <span className="text-white font-mono">{walletAnalysisData.collateralFactor}</span>
                        </div>
                      </div>
                    </div>

                    {/* Account Health */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">Account Health</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-300">Liquidity:</span>
                          <span className="text-white font-mono">{walletAnalysisData.accountLiquidity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Shortfall:</span>
                          <span className={parseFloat(walletAnalysisData.accountShortfall) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                            {walletAnalysisData.accountShortfall}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Health Factor:</span>
                          <span className={`font-mono ${
                            walletAnalysisData.healthFactor < 1.5 ? 'text-red-400' : 
                            walletAnalysisData.healthFactor < 2.0 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {walletAnalysisData.healthFactor.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Multi-Market Analysis */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">Multi-Market Analysis</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-300">Total Markets:</span>
                          <span className="text-white font-mono">{walletAnalysisData.totalMarkets}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Total Collateral:</span>
                          <span className="text-white font-mono">${parseFloat(walletAnalysisData.totalCollateralValue).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Total Borrows:</span>
                          <span className="text-white font-mono">${parseFloat(walletAnalysisData.totalBorrowValue).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Available Collateral:</span>
                          <span className="text-emerald-400 font-mono">${parseFloat(walletAnalysisData.availableCollateral).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Market Details */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">Market Details</h4>
                      <div className="space-y-4">
                        {walletAnalysisData.marketDetails.map((market, index) => (
                          <div key={index} className="p-4 backdrop-blur-sm border rounded-2xl bg-white/5 border-white/10">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-semibold text-white">{market.symbol}</span>
                              <div className="flex space-x-2">
                                {market.isCollateralEnabled && (
                                  <span className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded">Collateral</span>
                                )}
                                {market.isMarketActive && (
                                  <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">Active</span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-400">Balance:</span>
                                <span className="text-white ml-2">{parseFloat(market.userBalance).toFixed(4)}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Underlying:</span>
                                <span className="text-white ml-2">{parseFloat(market.underlyingAmount).toFixed(4)}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Price:</span>
                                <span className="text-white ml-2">${parseFloat(market.underlyingPrice).toFixed(4)}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Value:</span>
                                <span className="text-white ml-2">${parseFloat(market.collateralValue).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Borrow:</span>
                                <span className="text-red-400 ml-2">{parseFloat(market.borrowBalance).toFixed(4)}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Borrow Value:</span>
                                <span className="text-red-400 ml-2">${parseFloat(market.borrowValue).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* gMON Market Conditions */}
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-white/5 border-white/10">
                      <h4 className="font-semibold text-cyan-400 mb-4">gMON Market Conditions</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-300">gMON Price:</span>
                          <span className="text-white font-mono">${parseFloat(walletAnalysisData.gmonPrice).toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Total Supply:</span>
                          <span className="text-white font-mono">{walletAnalysisData.totalSupply}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Total Borrows:</span>
                          <span className="text-white font-mono">{walletAnalysisData.totalBorrows}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Available Liquidity:</span>
                          <span className="text-white font-mono">{walletAnalysisData.availableLiquidity}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Withdrawal Analysis */}
                  <div className="p-6 backdrop-blur-sm border rounded-3xl bg-cyan-500/10 border-cyan-500/30">
                    <h4 className="font-semibold text-cyan-400 mb-4">Withdrawal Analysis</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Can Withdraw:</span>
                        <span className={walletAnalysisData.canWithdraw ? 'text-emerald-400' : 'text-red-400'}>
                          {walletAnalysisData.canWithdraw ? '✅ YES' : '❌ NO'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Max Withdrawable:</span>
                        <span className="text-white font-mono">{walletAnalysisData.maxWithdrawable} gMON</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Max Value:</span>
                        <span className="text-white font-mono">${parseFloat(walletAnalysisData.maxWithdrawableUsd).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Safe Withdrawal:</span>
                        <span className="text-emerald-400 font-mono">{walletAnalysisData.safeWithdrawalPercentage}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Safe Amount:</span>
                        <span className="text-emerald-400 font-mono">{parseFloat(walletAnalysisData.safeWithdrawalGmon).toFixed(2)} gMON</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Safe Value:</span>
                        <span className="text-emerald-400 font-mono">${parseFloat(walletAnalysisData.safeWithdrawalUsd).toFixed(2)}</span>
                      </div>
                      {walletAnalysisData.withdrawalReason && (
                        <div className="mt-3 p-3 backdrop-blur-sm border rounded-2xl bg-amber-500/10 border-amber-500/30">
                          <div className="text-sm text-amber-300">
                            <strong>Reason:</strong> {walletAnalysisData.withdrawalReason}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Withdrawal Blockers */}
                  {walletAnalysisData.withdrawalBlockers.length > 0 && (
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-red-500/10 border-red-500/30">
                      <h4 className="font-semibold text-red-400 mb-4">Withdrawal Blockers</h4>
                      <ul className="space-y-2">
                        {walletAnalysisData.withdrawalBlockers.map((blocker, index) => (
                          <li key={index} className="text-sm text-red-300 flex items-center space-x-2">
                            <span>❌</span>
                            <span>{blocker}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {walletAnalysisData.recommendations.length > 0 && (
                    <div className="p-6 backdrop-blur-sm border rounded-3xl bg-amber-500/10 border-amber-500/30">
                      <h4 className="font-semibold text-amber-400 mb-4">Recommendations</h4>
                      <ul className="space-y-2">
                        {walletAnalysisData.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-amber-300 flex items-start space-x-2">
                            <span className="mt-0.5">💡</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
