import * as React from "react"
import { cn } from "@/lib/utils"
import { capsuleBase, capsuleContent, capsuleFocus, capsuleGlass } from "./capsule"
import { useTheme } from "next-themes"

export interface HeaderPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
  glowClassName?: string
  onClick?: () => void
  disabled?: boolean
  isPending?: boolean
  variant?: "default" | "wallet" | "network" | "level"
  size?: "sm" | "md"
}

// Standardized header pill component
export function HeaderPill({ 
  children, 
  className, 
  glowClassName,
  onClick, 
  disabled = false,
  isPending = false,
  variant = "default",
  size = "md",
  ...props
}: HeaderPillProps) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'

  const sizeClasses = {
    sm: "h-8 min-w-[7rem]",
    md: "h-9 min-w-[8rem]"
  }

  const variantClasses = {
    default: "",
    wallet: "px-3",
    network: "px-3", 
    level: "px-3 min-w-[9.5rem]"
  }

  return (
    <button
      type="button"
      className={cn(
        capsuleBase(capsuleFocus),
        sizeClasses[size],
        variantClasses[variant],
        "group relative",
        disabled && "opacity-50 cursor-not-allowed",
        isPending && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={onClick}
      disabled={disabled || isPending}
      style={capsuleGlass(isDark)}
      {...props}
    >
      {/* Background glow effect */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
        glowClassName || "bg-gradient-to-r from-green-400/10 via-green-500/20 to-green-600/10"
      )} />
      
      {/* Content */}
      <div className={cn(
        capsuleContent("gap-2"),
        "relative z-10"
      )}>
        {children}
      </div>
      
      {/* Outline */}
      <span 
        aria-hidden 
        className="absolute inset-0 rounded-full"
        style={{ border: '1px solid rgba(255,255,255,0.12)' }} 
      />
    </button>
  )
}

// Loading state for header pills
export function HeaderPillSkeleton({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClasses = {
    sm: "h-8 w-28",
    md: "h-9 w-32"
  }

  return (
    <div className={cn(
      "rounded-full bg-foreground/10 animate-pulse",
      sizeClasses[size]
    )} />
  )
}
