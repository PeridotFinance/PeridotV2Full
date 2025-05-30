"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, TrendingUp, TrendingDown, X, Check, Minus, AlertTriangle, Shield, Info } from "lucide-react";
import type { Asset } from "../../types/defi";
import { MiniChart, DonutChart } from "./ChartComponents";
import { generateChartData } from "../../utils/chartHelpers";

// Collateral Confirmation Modal Component
const CollateralConfirmationModal = ({
  asset,
  isOpen,
  onClose,
  onConfirm,
  currentCollateralStatus
}: {
  asset: Asset;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentCollateralStatus: boolean;
}) => {
  if (!isOpen) return null;

  const isEnabling = !currentCollateralStatus;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {isEnabling ? "Enable" : "Disable"} as Collateral
                </h3>
                <p className="text-sm text-muted-foreground">{asset.name} ({asset.symbol})</p>
              </div>
            </div>

            <div className="mb-6">
              {isEnabling ? (
                <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-2">Enable as Collateral</p>
                      <p>Each asset used as collateral increases your borrowing limit. Be careful, this can subject the asset to being seized in liquidation.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                      <p className="font-medium mb-2">Disable as Collateral</p>
                      <p>Disabling this asset as collateral will reduce your borrowing limit. Make sure you have sufficient collateral to maintain your health factor.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={onConfirm} 
                className={cn(
                  "flex-1",
                  isEnabling 
                    ? "bg-blue-600 hover:bg-blue-700" 
                    : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {isEnabling ? "Enable" : "Disable"} Collateral
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

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
  const [showCollateralModal, setShowCollateralModal] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [clientChartData, setClientChartData] = useState<Array<{day: number; value: number}>>([]);

  useEffect(() => {
    // Generate chart data on the client side
    const generatedData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true);
    setClientChartData(generatedData);
  }, [asset.id, asset.change24h]); // Regenerate if asset or its relevant properties change

  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"

  const handleCollateralClick = () => {
    // In demo mode, only allow toggle if wallet string shows > 0.
    if (isDemoMode && !(parseFloat(asset.wallet.split(" ")[0]) > 0)) {
      console.log("Collateral toggle disabled in Demo Mode for zero balance asset based on UI string.");
      return;
    }
    setShowCollateralModal(true);
  };

  const handleCollateralConfirm = () => {
    if (onToggleCollateral && asset.id) {
      onToggleCollateral(asset.id);
    }
    setShowCollateralModal(false);
  };

  return (
    <>
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
                onClick={handleCollateralClick}
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

      {/* Collateral Confirmation Modal */}
      <CollateralConfirmationModal
        asset={asset}
        isOpen={showCollateralModal}
        onClose={() => setShowCollateralModal(false)}
        onConfirm={handleCollateralConfirm}
        currentCollateralStatus={asset.collateral || false}
      />
    </>
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
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow" | "withdraw" | "repay") => void;
  isDemoMode: boolean;
  focusAmountInput?: boolean;
  onAmountInputFocused?: () => void;
}) => {
  const chartData = generateChartData(30, 0.05, asset.change24h ? asset.change24h > 0 : true)
  const chartColor = asset.change24h && asset.change24h > 0 ? "#22c55e" : "#ef4444"
  const [amount, setAmount] = useState("")
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [activeTab, setActiveTab] = useState(isSupply ? "supply" : "borrow");
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Demo data for user's current positions (this would come from props in a real implementation)
  const userSuppliedAmount = isDemoMode ? parseFloat(asset.wallet.split(" ")[0]) || 0 : 0;
  const userBorrowedAmount = isDemoMode ? 1200 : 0; // Mock borrowed amount for demo
  const maxBorrowLimit = isDemoMode ? 8500 : 0; // Mock borrow limit (80% of collateral value)
  const currentBorrowUsage = isDemoMode ? 0.65 : 0; // 65% of borrow limit used

  // Liquidity data for borrow markets
  const liquidityData = {
    totalLiquidity: 45680000, // Total available liquidity
    utilizationRate: 72.3, // Current utilization rate
    supplyRate: asset.apy, // Current supply rate
    borrowRate: asset.apy + 2, // Current borrow rate
    reserves: 2340000, // Protocol reserves
  };

  useEffect(() => {
    if (focusAmountInput && amountInputRef.current) {
      amountInputRef.current.focus();
      if (onAmountInputFocused) {
        onAmountInputFocused();
      }
    }
  }, [focusAmountInput, onAmountInputFocused]);

  const handleAction = (actionType: "supply" | "borrow" | "withdraw" | "repay") => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      console.error("Invalid amount entered.");
      return;
    }

    // Additional validation for withdraw and repay
    if (actionType === "withdraw" && numericAmount > userSuppliedAmount) {
      console.error("Cannot withdraw more than supplied amount.");
      return;
    }
    
    if (actionType === "repay" && numericAmount > userBorrowedAmount) {
      console.error("Cannot repay more than borrowed amount.");
      return;
    }

    // For borrow, check 80% limit
    if (actionType === "borrow") {
      const newBorrowAmount = userBorrowedAmount + numericAmount;
      if (newBorrowAmount > maxBorrowLimit * 0.8) {
        console.error("Exceeds 80% borrow limit.");
        return;
      }
    }

    onTransaction(asset, numericAmount, actionType);
    setAmount(""); // Clear amount after initiating transaction

    // Confirmation message should only show in demo mode or after actual success in live mode.
    if (isDemoMode) {
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 2000);
    }
  };

  const calculateForecast = (actionType: "supply" | "borrow" | "withdraw" | "repay") => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0 || !asset.apy) {
      return null;
    }
    
    let rate = asset.apy;
    
    // For borrow actions, use a higher APY (borrow rate)
    if (actionType === "borrow" || actionType === "repay") {
      rate = asset.apy + 2; // Assume borrow rate is 2% higher than supply rate
    }
    
    const yearlyAmount = (numericAmount * rate) / 100;
    return {
      amount: yearlyAmount.toFixed(2),
      isEarning: actionType === "supply",
      isCost: actionType === "borrow"
    };
  };

  const getMaxAmount = (actionType: "supply" | "borrow" | "withdraw" | "repay") => {
    switch (actionType) {
      case "withdraw":
        return userSuppliedAmount;
      case "repay":
        return userBorrowedAmount;
      case "borrow":
        return Math.max(0, (maxBorrowLimit * 0.8) - userBorrowedAmount);
      case "supply":
      default:
        // In demo mode, assume user has enough balance to supply
        return isDemoMode ? 10000 : 0;
    }
  };

  const forecast = calculateForecast(activeTab as any);
  const maxAmount = getMaxAmount(activeTab as any);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-4xl overflow-hidden"
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

        <div className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn("grid w-full", isSupply ? "grid-cols-2" : "grid-cols-2")}>
              {isSupply ? (
                <>
                  <TabsTrigger value="supply">Supply</TabsTrigger>
                  <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="borrow">Borrow</TabsTrigger>
                  <TabsTrigger value="repay">Repay</TabsTrigger>
                </>
              )}
            </TabsList>

            {/* Supply Tab */}
            <TabsContent value="supply" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-text/60 mb-1">Current Price</h4>
                    <div className="text-2xl font-bold">${asset.price?.toLocaleString() || "0.00"}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Supply APY</h4>
                      <div className="font-medium text-green-600">{asset.apy}%</div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Your Supply</h4>
                      <div className="font-medium">{userSuppliedAmount.toFixed(4)} {asset.symbol}</div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-text/60 mb-3">Collateral Status</h4>
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
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-text/60 mb-4">Supply Amount</h4>
                  <div className="relative">
                    <input
                      ref={amountInputRef}
                      type="text"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!isDemoMode && asset.symbol !== 'ETH'}
                      onFocus={onAmountInputFocused}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => setAmount(maxAmount.toString())}
                      >
                        MAX
                      </Button>
                      <span className="text-sm font-medium">{asset.symbol}</span>
                    </div>
                  </div>

                  {isDemoMode && forecast && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Estimated yearly earnings: <span className="font-semibold text-green-600">${forecast.amount}</span> (at {asset.apy}% APY)
                    </div>
                  )}

                  <Button
                    className="w-full mt-4 bg-green-600 text-white hover:bg-green-700"
                    onClick={() => handleAction("supply")}
                    disabled={(!isDemoMode && asset.symbol !== 'ETH') || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Supply {asset.symbol}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Withdraw Tab */}
            <TabsContent value="withdraw" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-text/60 mb-1">Available to Withdraw</h4>
                    <div className="text-2xl font-bold text-green-600">{userSuppliedAmount.toFixed(4)} {asset.symbol}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Current Value</h4>
                      <div className="font-medium">${(userSuppliedAmount * (asset.price || 0)).toFixed(2)}</div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Earned Interest</h4>
                      <div className="font-medium text-green-600">+${((userSuppliedAmount * (asset.price || 0)) * 0.05).toFixed(2)}</div>
                    </div>
                  </div>

                  {userSuppliedAmount > 0 && asset.collateral && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-amber-700">
                          <p className="font-medium">Collateral Warning</p>
                          <p>Withdrawing this asset will reduce your borrowing power and may affect your health factor.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-text/60 mb-4">Withdraw Amount</h4>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!isDemoMode}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => setAmount(maxAmount.toString())}
                      >
                        MAX
                      </Button>
                      <span className="text-sm font-medium">{asset.symbol}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    Available: {maxAmount.toFixed(4)} {asset.symbol}
                  </div>

                  <Button
                    className="w-full mt-4 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => handleAction("withdraw")}
                    disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount)) || parseFloat(amount) > maxAmount}
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Withdraw {asset.symbol}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Borrow Tab */}
            <TabsContent value="borrow" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-text/60 mb-1">Borrow APY</h4>
                    <div className="text-2xl font-bold text-red-600">{(asset.apy + 2).toFixed(2)}%</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Available to Borrow</h4>
                      <div className="font-medium">${maxAmount.toFixed(2)}</div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Borrow Limit Used</h4>
                      <div className="font-medium">{(currentBorrowUsage * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-text/60 mb-3">Borrow Limit (80% max)</h4>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${Math.min(currentBorrowUsage * 100, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0%</span>
                      <span>80% (Max)</span>
                    </div>
                  </div>

                  {/* Liquidity Section */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-text/60 mb-3">Market Liquidity</h4>
                    <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Liquidity</p>
                          <p className="font-medium">${(liquidityData.totalLiquidity / 1000000).toFixed(1)}M</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Utilization Rate</p>
                          <p className="font-medium">{liquidityData.utilizationRate}%</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${liquidityData.utilizationRate}%` }}
                        ></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">Supply Rate</p>
                          <p className="font-medium text-green-600">{liquidityData.supplyRate}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Borrow Rate</p>
                          <p className="font-medium text-red-600">{liquidityData.borrowRate}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-text/60 mb-4">Borrow Amount</h4>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!isDemoMode}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => setAmount(maxAmount.toString())}
                      >
                        80%
                      </Button>
                      <span className="text-sm font-medium">{asset.symbol}</span>
                    </div>
                  </div>

                  {isDemoMode && forecast && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Estimated yearly cost: <span className="font-semibold text-red-600">${forecast.amount}</span> (at {(asset.apy + 2).toFixed(2)}% APY)
                    </div>
                  )}

                  <Button
                    className="w-full mt-4 bg-red-600 text-white hover:bg-red-700"
                    onClick={() => handleAction("borrow")}
                    disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount)) || parseFloat(amount) > maxAmount}
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Borrow {asset.symbol}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Repay Tab */}
            <TabsContent value="repay" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-text/60 mb-1">Amount Borrowed</h4>
                    <div className="text-2xl font-bold text-red-600">{userBorrowedAmount.toFixed(2)} {asset.symbol}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Current Debt Value</h4>
                      <div className="font-medium">${(userBorrowedAmount * (asset.price || 0)).toFixed(2)}</div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-text/60 mb-1">Interest Accrued</h4>
                      <div className="font-medium text-red-600">+${((userBorrowedAmount * (asset.price || 0)) * 0.02).toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-green-700">
                        <p className="font-medium">Repayment Benefits</p>
                        <p>Repaying your debt will improve your health factor and free up borrowing capacity.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-text/60 mb-4">Repay Amount</h4>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!isDemoMode}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => setAmount(maxAmount.toString())}
                      >
                        MAX
                      </Button>
                      <span className="text-sm font-medium">{asset.symbol}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    Outstanding debt: {maxAmount.toFixed(4)} {asset.symbol}
                  </div>

                  <Button
                    className="w-full mt-4 bg-green-600 text-white hover:bg-green-700"
                    onClick={() => handleAction("repay")}
                    disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount)) || parseFloat(amount) > maxAmount}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Repay {asset.symbol}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {showConfirmation && isDemoMode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-sm text-center text-green-500 flex items-center justify-center"
            >
              <Check className="h-4 w-4 mr-1" /> Transaction Successful!
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
} 