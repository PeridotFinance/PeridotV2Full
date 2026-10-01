'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MeeClient } from '@biconomy/abstractjs';
import { parseBiconomyTransactionResponse, type ParsedTransactionResponse } from '@/lib/biconomy/tx-response-parser';

export type TransactionStatus = 
  | 'idle'
  | 'pending'
  | 'mining'
  | 'success'
  | 'failed'
  | 'unknown';

export interface TransactionReceipt {
  transactionStatus: string;
  explorerLinks?: string[];
  userOps?: Array<{
    chainId: number;
    executionStatus: string;
  }>;
  rawResponse?: any; // Store raw response for parsing
}

export interface UseBiconomyTransactionStatusOptions {
  hash: string | null;
  meeClient: MeeClient | null;
  enabled?: boolean;
  pollInterval?: number;
  onStatusChange?: (status: TransactionStatus) => void;
  onReceiptChange?: (receipt: TransactionReceipt | null) => void;
}

export interface UseBiconomyTransactionStatusResult {
  status: TransactionStatus;
  receipt: TransactionReceipt | null;
  parsedResponse: ParsedTransactionResponse | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for monitoring Biconomy transaction status
 * Supports both MEE client methods and API polling
 */
export function useBiconomyTransactionStatus({
  hash,
  meeClient,
  enabled = true,
  pollInterval = 5000,
  onStatusChange,
  onReceiptChange,
}: UseBiconomyTransactionStatusOptions): UseBiconomyTransactionStatusResult {
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [parsedResponse, setParsedResponse] = useState<ParsedTransactionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);
  const cancelledRef = useRef(false);

  // Map Biconomy status to our status type
  const mapStatus = useCallback((rawStatus: string): TransactionStatus => {
    const statusUC = rawStatus.toUpperCase();
    if (/(MINED_SUCCESS|SUCCESS|EXECUTED|COMPLETED)/.test(statusUC)) return 'success';
    if (/(FAILED|FAIL|MINED_FAIL|ERROR)/.test(statusUC)) return 'failed';
    if (/(MINING|IN_PROGRESS|PROCESSING)/.test(statusUC)) return 'mining';
    if (/(PENDING|QUEUED)/.test(statusUC)) return 'pending';
    return 'unknown';
  }, []);

  // Check status using MEE client
  const checkStatusWithMeeClient = useCallback(async (): Promise<TransactionReceipt | null> => {
    if (!meeClient || !hash) return null;

    try {
      const receipt = await meeClient.getSupertransactionReceipt({
        hash: hash as `0x${string}`,
        waitForReceipts: false,
      });
      
      return {
        transactionStatus: receipt.transactionStatus || 'PENDING',
        explorerLinks: receipt.explorerLinks,
        userOps: receipt.userOps?.map((op) => ({
          chainId: typeof op.chainId === 'string' ? Number(op.chainId) : op.chainId,
          executionStatus: op.executionStatus || 'PENDING',
        })),
      };
    } catch (err) {
      console.warn('[useBiconomyTransactionStatus] MEE client check failed:', err);
      return null;
    }
  }, [meeClient, hash]);

  // Check status using API
  const checkStatusWithAPI = useCallback(async (): Promise<TransactionReceipt | null> => {
    if (!hash) return null;

    try {
      const response = await fetch(`/api/biconomy/status?hash=${encodeURIComponent(hash)}`);
      if (!response.ok) return null;
      
      const data = await response.json();
      return {
        transactionStatus: data?.transactionStatus || data?.status || 'PENDING',
        explorerLinks: data?.explorerLinks || (data?.explorerUrl ? [data.explorerUrl] : []),
        userOps: data?.userOps,
        rawResponse: data, // Store raw response for parsing
      };
    } catch (err) {
      console.warn('[useBiconomyTransactionStatus] API check failed:', err);
      return null;
    }
  }, [hash]);

  // Refresh status
  const refresh = useCallback(async () => {
    if (!hash || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      // Try MEE client first, fallback to API
      let newReceipt = await checkStatusWithMeeClient();
      if (!newReceipt) {
        newReceipt = await checkStatusWithAPI();
      }

      if (newReceipt) {
        const newStatus = mapStatus(newReceipt.transactionStatus);
        setReceipt(newReceipt);
        setStatus(newStatus);
        
        // Parse the response if raw data is available
        if (newReceipt.rawResponse) {
          const parsed = parseBiconomyTransactionResponse(newReceipt.rawResponse);
          setParsedResponse(parsed);
        }
        
        if (onStatusChange) onStatusChange(newStatus);
        if (onReceiptChange) onReceiptChange(newReceipt);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('[useBiconomyTransactionStatus] Refresh failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [hash, enabled, checkStatusWithMeeClient, checkStatusWithAPI, mapStatus, onStatusChange, onReceiptChange]);

  // Start polling when hash is available
  useEffect(() => {
    if (!hash || !enabled) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setStatus('idle');
      setReceipt(null);
      return;
    }

    // Don't poll if already in terminal state
    const terminalStates: TransactionStatus[] = ['success', 'failed'];
    if (terminalStates.includes(status)) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    cancelledRef.current = false;
    
    // Initial check
    refresh();

      // Set up polling
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          if (isPollingRef.current || cancelledRef.current) return;
          const terminalStates: TransactionStatus[] = ['success', 'failed'];
          if (terminalStates.includes(status)) {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            return;
          }
          refresh();
        }, pollInterval);
      }

    return () => {
      cancelledRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hash, enabled, pollInterval, refresh, status]);

  return {
    status,
    receipt,
    parsedResponse,
    isLoading,
    error,
    refresh,
  };
}

