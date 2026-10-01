'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ExternalLink,
  Copy,
  ArrowRight,
  Coins,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMeeScanLink } from '@biconomy/abstractjs';
import type { ParsedTransactionResponse, ParsedUserOperation, ParsedTokenTransfer } from '@/lib/biconomy/tx-response-parser';
import { getStatusMessage, getStatusColor } from '@/lib/biconomy/tx-response-parser';
import { formatUnits } from 'viem';
import { useState } from 'react';

interface TransactionDetailsProps {
  parsedResponse: ParsedTransactionResponse;
  className?: string;
  showFullDetails?: boolean;
}

/**
 * Reusable component for displaying Biconomy transaction details
 * Can be used in action flows, transaction history, and analytics pages
 */
export function TransactionDetails({ 
  parsedResponse, 
  className = '',
  showFullDetails = false 
}: TransactionDetailsProps) {
  const [copiedHash, setCopiedHash] = useState(false);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(parsedResponse.itxHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const getStatusIcon = () => {
    switch (parsedResponse.overallStatus) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'partial_success':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-blue-600" />;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <CardTitle className="text-lg">
                  {getStatusMessage(parsedResponse.overallStatus)}
                </CardTitle>
                <CardDescription className="mt-1">
                  Transaction Hash: {parsedResponse.itxHash.slice(0, 10)}...{parsedResponse.itxHash.slice(-8)}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyHash}
              >
                <Copy className="h-4 w-4 mr-2" />
                {copiedHash ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a
                  href={getMeeScanLink(parsedResponse.itxHash as `0x${string}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on MEE Scan
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Chains</div>
              <div className="font-semibold">{parsedResponse.chainsInvolved.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">User Ops</div>
              <div className="font-semibold">{parsedResponse.userOps.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Gas</div>
              <div className="font-semibold">{parsedResponse.formattedTotalGasCost} ETH</div>
            </div>
            <div>
              <div className="text-muted-foreground">Status</div>
              <Badge className={getStatusColor(parsedResponse.overallStatus)}>
                {parsedResponse.overallStatus.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Payment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Payment Token</span>
            <span className="text-sm font-semibold">
              {parsedResponse.paymentInfo.formattedTokenAmount} {parsedResponse.paymentInfo.tokenSymbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Gas Fee</span>
            <span className="text-sm font-semibold">
              {parsedResponse.paymentInfo.formattedGasFee} {parsedResponse.paymentInfo.tokenSymbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Orchestration Fee</span>
            <span className="text-sm font-semibold">
              {parsedResponse.paymentInfo.formattedOrchestrationFee} {parsedResponse.paymentInfo.tokenSymbol}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total Fee</span>
            <span className="text-sm font-bold">
              {parsedResponse.paymentInfo.formattedTotalFee} {parsedResponse.paymentInfo.tokenSymbol}
            </span>
          </div>
          {parsedResponse.paymentInfo.sponsored && (
            <Badge variant="outline" className="w-fit">
              Sponsored (Gasless)
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* User Operations */}
      {showFullDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              User Operations ({parsedResponse.userOps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsedResponse.userOps.map((userOp, idx) => (
              <UserOperationCard key={idx} userOp={userOp} index={idx} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Successful Operations</span>
              <span className="font-semibold text-green-600">
                {parsedResponse.summary.successfulOps}
              </span>
            </div>
            {parsedResponse.summary.failedOps > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed Operations</span>
                <span className="font-semibold text-red-600">
                  {parsedResponse.summary.failedOps}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Transfers</span>
              <span className="font-semibold">{parsedResponse.summary.totalTransfers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chains Involved</span>
              <div className="flex gap-1">
                {parsedResponse.chainsInvolved.map((chainId) => (
                  <Badge key={chainId} variant="outline" className="text-xs">
                    {chainId}
                  </Badge>
                ))}
              </div>
            </div>
            {parsedResponse.summary.errors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                  Errors:
                </div>
                <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                  {parsedResponse.summary.errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Component for displaying a single user operation
 */
function UserOperationCard({ 
  userOp, 
  index 
}: { 
  userOp: ParsedUserOperation; 
  index: number 
}) {
  const getStatusIcon = () => {
    if (userOp.executionStatus === 'MINED_SUCCESS' && userOp.isConfirmed) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (userOp.revertError) {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
    return <Clock className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium">Operation #{index + 1}</span>
          <Badge variant="outline">Chain {userOp.chainId}</Badge>
          {userOp.isCleanUpUserOp && (
            <Badge variant="secondary" className="text-xs">Cleanup</Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {userOp.executionStatus}
        </div>
      </div>

      {userOp.revertError && (
        <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
          {userOp.revertError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Gas Cost:</span>
          <span className="ml-2 font-mono">{userOp.formattedGasCost} ETH</span>
        </div>
        {userOp.minedTimestamp && (
          <div>
            <span className="text-muted-foreground">Mined:</span>
            <span className="ml-2">
              {new Date(userOp.minedTimestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Token Transfers */}
      {(userOp.tokenTransfers.length > 0 || userOp.nativeTransfers.length > 0) && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Transfers:</div>
          <div className="space-y-1">
            {userOp.nativeTransfers.map((transfer, idx) => (
              <TransferRow key={`native-${idx}`} transfer={transfer} />
            ))}
            {userOp.tokenTransfers.map((transfer, idx) => (
              <TransferRow key={`token-${idx}`} transfer={transfer} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Component for displaying a single transfer
 */
function TransferRow({ transfer }: { transfer: ParsedTokenTransfer }) {
  return (
    <div className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-mono text-[10px] truncate max-w-[8ch]">
          {transfer.fromAddress.slice(0, 6)}...{transfer.fromAddress.slice(-4)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-[10px] truncate max-w-[8ch]">
          {transfer.toAddress.slice(0, 6)}...{transfer.toAddress.slice(-4)}
        </span>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <span className="font-semibold">{transfer.formattedAmount}</span>
        <span className="text-muted-foreground">{transfer.tokenSymbol}</span>
      </div>
    </div>
  );
}



