"use client";

import { useEffect, useState, useMemo } from "react";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey, Cluster } from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { MultiChainStatus } from "@/components/wallet/multi-chain-status";
import { useSolana } from "@/hooks/use-solana";

// Example user data - initial placeholder
const initialUserWallet = "Gzj2Zq3PwyLkhq6vVhLDG84biifQq496wVrTAD6QpNvo";

// Define interfaces for the stats we want to display
interface SolanaStats {
  currentSlot: number | null;
  blockHeight: number | null;
  transactionCount: number | null;
  epoch: string | null;
  tps: number | null;
  network: Cluster;
}

// Interface for Jupiter Open Order (based on example)
interface JupiterOpenOrder {
  account: {
    borrowMakingAmount: string;
    createdAt: string;
    expiredAt: string | null;
    makingAmount: string;
    oriMakingAmount: string;
    oriTakingAmount: string;
    takingAmount: string;
    uniqueId: string;
    updatedAt: string;
    feeAccount: string;
    inputMint: string;
    inputMintReserve: string;
    inputTokenProgram: string;
    maker: string;
    outputMint: string;
    outputTokenProgram: string;
    feeBps: number;
    bump: number;
  };
  publicKey: string;
}

const SolanaDashboardPage = () => {
  const [stats, setStats] = useState<SolanaStats>({
    currentSlot: null,
    blockHeight: null,
    transactionCount: null,
    epoch: null,
    tps: null,
    network: "devnet",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [inputWalletAddress, setInputWalletAddress] = useState<string>(initialUserWallet);
  const [activeWalletAddress, setActiveWalletAddress] = useState<string>("");

  const [openOrders, setOpenOrders] = useState<JupiterOpenOrder[]>([]);
  const [isOpenOrdersLoading, setIsOpenOrdersLoading] = useState(false);
  const [openOrdersError, setOpenOrdersError] = useState<string | null>(null);

  const { theme, resolvedTheme } = useTheme();
  const isDarkMode = theme === "dark" || resolvedTheme === "dark";

  // Multi-chain wallet integration
  const { 
    isConnected: isSolanaConnected, 
    publicKey: solanaPublicKey,
    getBalance: getSolanaBalance 
  } = useSolana();

  const rpcEndpoint = useMemo(() => {
    if (stats.network === "mainnet-beta") {
      return "https://mainnet.helius-rpc.com/?api-key=2d1ee62f-778a-426c-b525-9599b68a2414";
    }
    return clusterApiUrl(stats.network);
  }, [stats.network]);

  const connection = useMemo(() => new Connection(rpcEndpoint, "confirmed"), [rpcEndpoint]);

  // Auto-populate wallet address if Solana wallet is connected
  useEffect(() => {
    if (isSolanaConnected && solanaPublicKey) {
      setInputWalletAddress(solanaPublicKey.toString());
    }
  }, [isSolanaConnected, solanaPublicKey]);

  // Fetch core Solana stats (slot, block height, etc.)
  useEffect(() => {
    const fetchCoreSolanaData = async () => {
      setIsLoading(true); // Combined loading for core stats
      setError(null);
      try {
        const [
          slot,
          blockHeight,
          transactionCount,
          epochInfo,
          recentPerformanceSamples,
        ] = await Promise.all([
          connection.getSlot(),
          connection.getBlockHeight(),
          connection.getTransactionCount(),
          connection.getEpochInfo(),
          connection.getRecentPerformanceSamples(5),
        ]);

        let avgTps = 0;
        if (recentPerformanceSamples && recentPerformanceSamples.length > 0) {
          const totalTransactions = recentPerformanceSamples.reduce(
            (acc, sample) => acc + sample.numTransactions,
            0
          );
          const totalSeconds = recentPerformanceSamples.reduce(
            (acc, sample) => acc + sample.samplePeriodSecs,
            0
          );
          avgTps = totalSeconds > 0 ? totalTransactions / totalSeconds : 0;
        }

        setStats(prevStats => ({
          ...prevStats,
          currentSlot: slot,
          blockHeight: blockHeight,
          transactionCount: transactionCount,
          epoch: `${epochInfo.epoch} (${(
            (epochInfo.slotIndex / epochInfo.slotsInEpoch) *
            100
          ).toFixed(2)}%)`,
          tps: parseFloat(avgTps.toFixed(2)),
        }));
      } catch (err) {
        console.error("Failed to fetch core Solana data:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred fetching core data"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchCoreSolanaData();
    const intervalId = setInterval(fetchCoreSolanaData, 30000);
    return () => clearInterval(intervalId);
  }, [connection]); // Only depends on connection for core stats

  const handleFetchOpenOrders = async () => {
    if (!inputWalletAddress) {
      setOpenOrdersError("Please enter a Solana wallet address.");
      setActiveWalletAddress("");
      setOpenOrders([]);
      return;
    }
    try {
      new PublicKey(inputWalletAddress); // Validate address format
      setActiveWalletAddress(inputWalletAddress);
      setOpenOrdersError(null);
    } catch (e) {
      setOpenOrdersError("Invalid Solana wallet address format.");
      setActiveWalletAddress("");
      setOpenOrders([]);
      return;
    }

    setIsOpenOrdersLoading(true);
    setOpenOrders([]); // Clear previous orders

    try {
      const response = await fetch(`https://api.jup.ag/limit/v2/openOrders?wallet=${inputWalletAddress}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown API error" }));
        throw new Error(`Jupiter API Error: ${response.status} ${response.statusText} - ${errorData.message || ''}`);
      }
      const data: JupiterOpenOrder[] = await response.json();
      setOpenOrders(data);
    } catch (err) {
      console.error("Failed to fetch open orders:", err);
      setOpenOrdersError(
        err instanceof Error ? err.message : "An unknown error occurred fetching open orders"
      );
    } finally {
      setIsOpenOrdersLoading(false);
    }
  };

  const cardClasses = cn(
    "shadow-lg transition-all hover:shadow-xl",
    isDarkMode ? "bg-gray-800/70 border-gray-700" : "bg-white/70 border-gray-200"
  );
  const textPrimaryClass = isDarkMode ? "text-white" : "text-gray-800";
  const textSecondaryClass = isDarkMode ? "text-gray-400" : "text-gray-600";

  return (
    <div className={cn("min-h-screen p-4 md:p-8", isDarkMode ? "bg-gray-900" : "bg-gradient-to-br from-slate-100 to-sky-100")}>
      <header className="mb-8">
        <h1 className={cn("text-3xl md:text-4xl font-bold text-center", textPrimaryClass)}>
          Peridot Dashboard
        </h1>
        <p className={cn("text-center mt-2", textSecondaryClass)}>
          Real-time statistics from the Solana {stats.network} network and Peridot project analytics.
        </p>
      </header>

      {/* Multi-Chain Wallet Connection Section */}
      <div className="mb-8">
        <h2 className={cn("text-2xl font-semibold text-center mb-6", textPrimaryClass)}>
          Multi-Chain Wallet Connection
        </h2>
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 mb-6">
          <div className="flex flex-col items-center gap-4">
            <ConnectWalletButton className="w-fit" />
            <p className={cn("text-sm text-center max-w-md", textSecondaryClass)}>
              Connect your wallet to access both EVM and Solana networks. 
              Switch between networks directly in your wallet.
            </p>
          </div>
          <MultiChainStatus />
        </div>
        
        {isSolanaConnected && (
          <Card className={cn("max-w-2xl mx-auto", cardClasses)}>
            <CardHeader>
              <CardTitle className={cn("text-lg flex items-center gap-2", textPrimaryClass)}>
                🟣 Connected Solana Wallet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className={cn("text-sm", textSecondaryClass)}>
                  <span className="font-medium">Address:</span> {solanaPublicKey?.toString()}
                </p>
                <p className={cn("text-sm", textSecondaryClass)}>
                  Your wallet is now connected and will be auto-populated in forms below.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator className={cn("my-8", isDarkMode ? "bg-gray-700" : "bg-gray-300")} />

      {error && (
        <Card className={cn("mb-6 bg-red-500/10 border-red-500/30", cardClasses)}>
          <CardHeader>
            <CardTitle className="text-red-500">Network Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={textSecondaryClass}>{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Section Title: Solana Network Health */}
      <div className="mb-12">
        <h2 className={cn("text-2xl md:text-3xl font-semibold text-center mb-6", textPrimaryClass)}>
          Solana Network Health
        </h2>
        <p className={cn("text-center text-sm mb-8", textSecondaryClass)}>
          Live data from the Solana {stats.network} network.
        </p>

        {/* Core Solana Network Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Current Slot</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>
                {isLoading ? "Loading..." : stats.currentSlot?.toLocaleString() ?? "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Block Height</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>
                {isLoading ? "Loading..." : stats.blockHeight?.toLocaleString() ?? "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Transaction Count</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>
                {isLoading ? "Loading..." : stats.transactionCount?.toLocaleString() ?? "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Current Epoch</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>
                {isLoading ? "Loading..." : stats.epoch ?? "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Average TPS (Recent)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>
                {isLoading ? "Loading..." : stats.tps?.toLocaleString() ?? "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Network</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={stats.network}
                onChange={(e) => {
                  setStats(prev => ({
                    ...prev,
                    network: e.target.value as Cluster,
                    currentSlot: null, blockHeight: null, transactionCount: null, epoch: null, tps: null
                  }));
                  setActiveWalletAddress("");
                  setOpenOrders([]);
                  setOpenOrdersError(null);
                }}
                className={cn("p-2 rounded text-lg w-full", isDarkMode ? "bg-gray-700 text-white border-gray-600" : "bg-white text-black border-gray-300")}
              >
                <option value="mainnet-beta">Mainnet Beta</option>
                <option value="devnet">Devnet</option>
                <option value="testnet">Testnet</option>
              </select>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className={cn("my-8", isDarkMode ? "bg-gray-700" : "bg-gray-300")} />
      
      {/* Jupiter Open Orders Card - Stays within Solana Network Health or could be its own sub-section if preferred */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        <Card className={cardClasses}>
          <CardHeader>
            <CardTitle className={cn("text-2xl mb-4", textPrimaryClass)}>Open Limit Orders (Jupiter API)</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-grow w-full sm:w-auto">
                    <label htmlFor="jupiterWalletInput" className={cn("text-sm font-medium mb-1 block", textSecondaryClass)}>
                        Enter Solana Wallet Address
                    </label>
                    <Input
                        id="jupiterWalletInput"
                        type="text"
                        placeholder="Enter Solana wallet for Jupiter orders"
                        value={inputWalletAddress}
                        onChange={(e) => {
                            setInputWalletAddress(e.target.value);
                            // Clear previous results and errors when input changes if a wallet was active
                            if (activeWalletAddress) {
                                setActiveWalletAddress("");
                                setOpenOrders([]);
                                setOpenOrdersError(null);
                            }
                        }}
                        className={cn(isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300")}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {isSolanaConnected && solanaPublicKey && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setInputWalletAddress(solanaPublicKey.toString());
                        if (activeWalletAddress) {
                          setActiveWalletAddress("");
                          setOpenOrders([]);
                          setOpenOrdersError(null);
                        }
                      }}
                      className="w-full sm:w-auto"
                    >
                      Use Connected
                    </Button>
                  )}
                  <Button onClick={handleFetchOpenOrders} className="w-full sm:w-auto" disabled={isOpenOrdersLoading || !inputWalletAddress}>
                      {isOpenOrdersLoading ? "Fetching Orders..." : "Fetch Open Orders"}
                  </Button>
                </div>
            </div>
            {activeWalletAddress && (
              <div className="mt-2 flex items-center gap-2">
                <p className={cn("text-sm", textSecondaryClass)}>
                  Showing orders for: <span className={textPrimaryClass}>{activeWalletAddress}</span>
                </p>
                {isSolanaConnected && solanaPublicKey && activeWalletAddress === solanaPublicKey.toString() && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Connected Wallet
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {openOrdersError && (
              <p className="text-sm text-red-500 mb-2">{openOrdersError}</p>
            )}
            {!activeWalletAddress && !openOrdersError && (
                <p className={textSecondaryClass}>Enter a wallet address and click "Fetch Open Orders".</p>
            )}
            {isOpenOrdersLoading && <p className={textSecondaryClass}>Loading open orders...</p>}
            {!isOpenOrdersLoading && !openOrdersError && activeWalletAddress && openOrders.length === 0 && (
              <p className={textSecondaryClass}>No open limit orders found for this wallet on Jupiter.</p>
            )}
            {openOrders.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <Table>
                  <TableHeader>
                    <TableRow className={isDarkMode ? "border-gray-700" : ""}>
                      <TableHead className={textPrimaryClass}>Input Mint</TableHead>
                      <TableHead className={textPrimaryClass}>Output Mint</TableHead>
                      <TableHead className={textPrimaryClass}>Making Amt</TableHead>
                      <TableHead className={textPrimaryClass}>Taking Amt</TableHead>
                      <TableHead className={textPrimaryClass}>Created At</TableHead>
                      <TableHead className={textPrimaryClass}>Order ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((order) => (
                      <TableRow key={order.publicKey} className={isDarkMode ? "border-gray-700" : ""}>
                        <TableCell className={cn(textSecondaryClass, "break-all text-xs")}>{order.account.inputMint}</TableCell>
                        <TableCell className={cn(textSecondaryClass, "break-all text-xs")}>{order.account.outputMint}</TableCell>
                        <TableCell className={textSecondaryClass}>{order.account.makingAmount}</TableCell>
                        <TableCell className={textSecondaryClass}>{order.account.takingAmount}</TableCell>
                        <TableCell className={textSecondaryClass}>{new Date(order.account.createdAt).toLocaleString()}</TableCell>
                        <TableCell className={cn(textSecondaryClass, "break-all text-xs")}>{order.publicKey}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className={cn("my-12", isDarkMode ? "bg-gray-700" : "bg-gray-300")} />

      {/* Section Title: Peridot Project Analytics */}
      <div className="mb-12">
        <h2 className={cn("text-2xl md:text-3xl font-semibold text-center mb-6", textPrimaryClass)}>
          Peridot Project Analytics
        </h2>
        <p className={cn("text-center text-sm mb-8", textSecondaryClass)}>
          Key metrics and community statistics for the Peridot Protocol.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>X (Twitter) Followers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>800</p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>X (Twitter) Impressions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>10,000</p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Telegram Members</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>500</p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Website Unique Visitors</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>5,000</p>
            </CardContent>
          </Card>
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-xl", textPrimaryClass)}>Waitlist Emails</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-semibold", textPrimaryClass)}>20+</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className={cn("mt-12 text-center", textSecondaryClass)}>
        <p>Core network data refreshed periodically. Last updated: {new Date().toLocaleTimeString()}</p>
      </footer>
    </div>
  );
};

export default SolanaDashboardPage; 