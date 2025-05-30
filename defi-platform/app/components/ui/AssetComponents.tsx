"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, TrendingUp, TrendingDown, X, Check } from "lucide-react";
import type { Asset } from "../../types/defi";
import { MiniChart, DonutChart } from "./ChartComponents";
import { generateChartData } from "../../utils/chartHelpers";

// Interactive asset row component
export const AssetRow = ({
  asset,
  isSupply = true,
  onToggleCollateral,
  isDemoMode,
  onQuickSupplyClick,
  onOpenDetailModal,
}: {
  asset: Asset;
  isSupply?: boolean;
  onToggleCollateral?: (assetId: string) => void;
  isDemoMode?: boolean;
  onQuickSupplyClick?: (asset: Asset) => void;
  onOpenDetailModal: (asset: Asset, isSupplyAction: boolean) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [clientChartData, setClientChartData] = useState<Array<{day: number; value: number}>>([]);

  useEffect(() => {
    // Generate chart data on the client side
    const generatedData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true);
    setClientChartData(generatedData);
  }, [asset.id, asset.change24h]); // Regenerate if asset or its relevant properties change

  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.tr
      className="relative group"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      layout
    >
      <TableCell className="relative whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <Image
              src={asset.icon}
              alt={asset.name}
              width={32}
              height={32}
              className="relative z-10"
            />
          </motion.div>
          <div>
            <div className="font-medium">{asset.name}</div>
            <div className="text-xs text-text/60">{asset.symbol}</div>
          </div>
        </div>

        {/* Hover effect line */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: isHovered ? "100%" : "0%",
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
        />
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.apy}%</div>
          <div className="text-xs text-text/60">APY</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div>{asset.wallet}</div>
          {isHovered && isSupply && isDemoMode && onQuickSupplyClick && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickSupplyClick(asset);
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </div>
      </TableCell>

      {isSupply ? (
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center">
            <motion.div
              className={cn(
                "w-12 h-6 bg-secondary/20 rounded-full flex items-center cursor-pointer",
                asset.collateral ? "justify-start pl-1" : "justify-end pr-1",
                // Disable interactivity only in demo mode if wallet string is 0
                (isDemoMode && !(parseFloat(asset.wallet.split(" ")[0]) > 0)) && "opacity-50 cursor-not-allowed"
              )}
              // Apply hover/tap effects unless in demo mode with 0 wallet balance
              whileHover={ (isDemoMode && !(parseFloat(asset.wallet.split(" ")[0]) > 0)) ? undefined : { scale: 1.05 } }
              whileTap={ (isDemoMode && !(parseFloat(asset.wallet.split(" ")[0]) > 0)) ? undefined : { scale: 0.95 } }
              onClick={() => {
                if (onToggleCollateral && asset.id) {
                  // In demo mode, only allow toggle if wallet string shows > 0.
                  // In live mode, always allow toggle attempt (on-chain logic will be the source of truth).
                  if (isDemoMode && !(parseFloat(asset.wallet.split(" ")[0]) > 0)) {
                    console.log("Collateral toggle disabled in Demo Mode for zero balance asset based on UI string.");
                    return; // Prevent action if in demo mode and UI shows 0 balance
                  }
                  onToggleCollateral(asset.id); // Proceed with toggle action
                }
              }}
            >
              <motion.div
                className={cn("w-4 h-4 rounded-full", asset.collateral ? "bg-primary" : "bg-muted")}
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.div>
          </div>
        </TableCell>
      ) : (
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <div>{asset.liquidity}</div>
            <MiniChart data={clientChartData} color={chartColor} />
          </div>
        </TableCell>
      )}

      <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
        <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetailModal(asset, isSupply);
            }}
          >
            <ArrowRight className="h-4 w-4 mr-1" />
            {isSupply ? "Supply" : "Borrow"}
          </Button>
        </motion.div>
      </TableCell>
    </motion.tr>
  )
}

// Asset detail modal component
export const AssetDetailCard = ({
  asset,
  onClose,
  isSupply = true,
  onTransaction,
  isDemoMode,
  focusAmountInput,
  onAmountInputFocused,
}: {
  asset: Asset;
  onClose: () => void;
  isSupply?: boolean;
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void;
  isDemoMode: boolean;
  focusAmountInput?: boolean;
  onAmountInputFocused?: () => void;
}) => {
  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"
  const [amount, setAmount] = useState("")
  const [showConfirmation, setShowConfirmation] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusAmountInput && amountInputRef.current) {
      amountInputRef.current.focus();
      if (onAmountInputFocused) {
        onAmountInputFocused();
      }
    }
  }, [focusAmountInput, onAmountInputFocused]);

  const handleAction = () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      console.error("Invalid amount entered.");
      return;
    }

    onTransaction(asset, numericAmount, isSupply ? "supply" : "borrow");
    setAmount(""); // Clear amount after initiating transaction

    // Confirmation message should only show in demo mode or after actual success in live mode.
    if (isDemoMode) {
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 2000);
    }
  };

  const calculateForecast = () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0 || !asset.apy) {
      return null;
    }
    const yearlyYield = (numericAmount * asset.apy) / 100;
    return yearlyYield.toFixed(2);
  };

  const forecast = calculateForecast();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={36}
                  height={36}
                />
              </div>
              <div>
                <h3 className="text-xl font-bold">{asset.name}</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={cn(
                  "px-2 py-1 rounded-full text-xs font-medium flex items-center",
                  asset.change24h && asset.change24h > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
                )}
              >
                {asset.change24h && asset.change24h > 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {asset.change24h && asset.change24h > 0 ? "+" : ""}
                {asset.change24h}%
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-text/60 mb-1">Current Price</h4>
              <div className="text-2xl font-bold">${asset.price?.toLocaleString() || "0.00"}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <h4 className="text-sm font-medium text-text/60 mb-1">Market Cap</h4>
                <div className="font-medium">{asset.marketCap}</div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text/60 mb-1">24h Volume</h4>
                <div className="font-medium">{asset.volume24h}</div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-medium text-text/60 mb-3">APY</h4>
              <div className="flex items-center space-x-3">
                <DonutChart value={asset.apy} max={15} color="var(--primary)" />
                <div>
                  <div className="text-2xl font-bold">{asset.apy}%</div>
                  <div className="text-sm text-text/60">Annual Percentage Yield</div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-2">
                {isSupply ? "Collateral Factor" : "Liquidity Available"}
              </h4>
              {isSupply ? (
                <div className="flex items-center space-x-3">
                  <div
                    className={cn(
                      "px-3 py-1 rounded-full text-sm font-medium",
                      asset.collateral ? "bg-primary/10 text-primary" : "bg-muted/50 text-text/60",
                    )}
                  >
                    {asset.collateral ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-sm text-text/60">
                    {asset.collateral
                      ? "This asset can be used as collateral"
                      : "This asset cannot be used as collateral"}
                  </div>
                </div>
              ) : (
                <div className="text-lg font-medium">{asset.liquidity}</div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-text/60 mb-4">Price History (30 Days)</h4>
            <div className="h-[200px] w-full bg-card/50 rounded-lg border border-border/50 p-4 flex items-center justify-center">
              <MiniChart data={chartData} color={chartColor} height={150} width={300} />
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-medium text-text/60 mb-3">{isSupply ? "Supply" : "Borrow"} Amount</h4>
              <div className="relative">
                <input
                  ref={amountInputRef}
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode && asset.symbol !== 'ETH'} // Allow ETH input in live mode, other ERC20s still demo only for now
                  onFocus={onAmountInputFocused}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && forecast && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Estimated yearly {isSupply ? "earnings" : "cost"}: <span className="font-semibold">${forecast}</span> (at {asset.apy}% APY)
                </div>
              )}

              <Button
                className="w-full mt-4 bg-primary text-background hover:bg-primary/90"
                onClick={handleAction}
                disabled={(!isDemoMode && asset.symbol !== 'ETH') || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))} // Allow ETH supply in live mode
              >
                {isSupply ? "Supply" : "Borrow"} {asset.symbol}
              </Button>
              {showConfirmation && isDemoMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-center text-green-500 flex items-center justify-center"
                >
                  <Check className="h-4 w-4 mr-1" /> Transaction Successful!
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
} 