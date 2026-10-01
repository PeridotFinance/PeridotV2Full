"use client"

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Check, ExternalLink, Bridge, Layers, Zap } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

interface BalanceRowProps {
  chainName: string
  amount: string
  icon: string
  isCurrent?: boolean
}

function BalanceRow({ chainName, amount, icon, isCurrent }: BalanceRowProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-2xl transition-all border",
      isCurrent 
        ? "bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]" 
        : "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10"
    )}>
      <div className="flex items-center gap-3">
        <div className="relative w-6 h-6 rounded-full overflow-hidden border border-white/10">
          <Image src={icon} alt={chainName} fill className="object-contain" unoptimized />
        </div>
        <span className={cn("text-xs font-bold", isCurrent ? "text-primary" : "text-white/80")}>
          {chainName} {isCurrent && "(Current)"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-black", isCurrent ? "text-primary" : "text-white")}>
          {amount}
        </span>
        {isCurrent && <Check className="w-3 h-3 text-primary" />}
      </div>
    </div>
  )
}

import { cn } from "@/lib/utils"

export function CrossChainBalanceDropdown({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="w-80 p-0 bg-transparent border-none shadow-none" 
          sideOffset={20}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="p-6 rounded-[2.5rem] glass-strong border border-white/20 shadow-2xl space-y-5 backdrop-blur-3xl relative overflow-hidden"
          >
            {/* Background Accent */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/20">
                    <Layers className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Across Networks</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-black text-white">1,000 USSC</span>
                  <span className="text-[9px] text-primary font-bold">~$1,000.00</span>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                <BalanceRow 
                  chainName="Arbitrum" 
                  amount="500 USSC" 
                  icon="/tokenimages/app/arbitrum-logo.svg" 
                />
                <BalanceRow 
                  chainName="Optimism" 
                  amount="500 USSC" 
                  icon="/tokenimages/app/base-logo.svg" // Using base as placeholder if optimism missing, but usually we have it
                  isCurrent 
                />
                <BalanceRow 
                  chainName="Polygon" 
                  amount="0 USSC" 
                  icon="/tokenimages/app/polygon-matic-logo.svg" 
                />
              </div>

              <div className="pt-2">
                <button className={cn(
                  "w-full py-4 rounded-[1.5rem] bg-primary text-black transition-all",
                  "flex items-center justify-center gap-3 group relative overflow-hidden shadow-lg shadow-primary/20",
                  "hover:scale-[1.02] active:scale-[0.98]"
                )}>
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <Zap className="w-4 h-4 fill-current" />
                  <span className="text-[11px] font-black tracking-[0.2em] uppercase">Bridge & Supply</span>
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
              </div>
            </div>
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}









