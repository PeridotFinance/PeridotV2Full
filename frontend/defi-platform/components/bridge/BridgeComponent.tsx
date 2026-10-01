"use client"

import { useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import BridgeArticle from "./BridgeArticle"
import { SquidWidgetWrapper } from "./SquidWidgetWrapper"
import { PeridotWalletAnnouncer } from "@/components/wallet/PeridotWalletAnnouncer"
import { FEE_WALLET, FEE_BPS } from "@/lib/swap/fee-config"

type BridgeComponentProps = {
  className?: string
}

const BridgeComponent = ({ className }: BridgeComponentProps) => {
  const { resolvedTheme } = useTheme()
  const widgetThemeType: 'dark' | 'light' = resolvedTheme === "dark" ? "dark" : "light"

  // Stable base config to avoid re-initializing the widget on unrelated re-renders
  const baseSquidConfigRef = useRef({
    integratorId: "peridot-finance-1f8r3-4f2f",
    apiUrl: "https://apiplus.squidrouter.com",
    collectFees: {
      integratorAddress: FEE_WALLET,
      fee: FEE_BPS,
    },
  })

  // Peridot theme colors - aligned with brand
  // Primary: hsl(150, 59%, 48%) ≈ #33C47C (green/teal)
  const themeOverrides = useMemo(() => {
    if (widgetThemeType === 'dark') {
      return {
        color: {
          "grey-100": "#F0F5F2", // Light green-tinted
          "grey-200": "#E0EAE4",
          "grey-300": "#C4D4CA",
          "grey-400": "#9DB5A8",
          "grey-500": "#7A9585",
          "grey-600": "#5F7568",
          "grey-700": "#4A5D52",
          "grey-800": "#2F3D35",
          "grey-900": "#1A241F", // Dark green-tinted background
          "royal-300": "#7AE5A8", // Light Peridot green
          "royal-400": "#5DD895",
          "royal-500": "#33C47C", // Peridot primary green
          "royal-600": "#2AA066",
          "royal-700": "#217C50",
          "status-positive": "#7AE870",
          "status-negative": "#FF4D5B",
          "status-partial": "#F3AF25",
          "highlight-700": "#7AE870",
          "animation-bg": "#33C47C",
          "animation-text": "#F0F5F2",
          "button-lg-primary-bg": "#33C47C",
          "button-lg-primary-text": "#1A241F",
          "button-lg-secondary-bg": "#2F3D35",
          "button-lg-secondary-text": "#F0F5F2",
          "button-lg-tertiary-bg": "#4A5D52",
          "button-lg-tertiary-text": "#C4D4CA",
          "button-md-primary-bg": "#33C47C",
          "button-md-primary-text": "#1A241F",
          "button-md-secondary-bg": "#2F3D35",
          "button-md-secondary-text": "#F0F5F2",
          "button-md-tertiary-bg": "#4A5D52",
          "button-md-tertiary-text": "#C4D4CA",
          "button-sm-primary-bg": "#33C47C",
          "button-sm-primary-text": "#1A241F",
          "button-sm-secondary-bg": "#2F3D35",
          "button-sm-secondary-text": "#F0F5F2",
          "button-sm-tertiary-bg": "#4A5D52",
          "button-sm-tertiary-text": "#C4D4CA",
          "input-bg": "#1A241F",
          "input-placeholder": "#7A9585",
          "input-text": "#E0EAE4",
          "input-selection": "#33C47C",
          "menu-bg": "#1A241FA8",
          "menu-text": "#F0F5F2A8",
          "menu-backdrop": "#F0F5F21A",
          "modal-backdrop": "#1A241F54"
        },
        boxShadow: {
          container: '0 2px 4px rgba(0,0,0,0.35), 0 6px 40px -2px rgba(0,0,0,0.4)'
        },
      } as any
    }
    // Light mode - Peridot green theme
    return {
      color: {
        'grey-100': '#F8FAF9',
        'grey-200': '#F0F5F2',
        'grey-300': '#E0EAE4',
        'grey-400': '#C4D4CA',
        'grey-500': '#9DB5A8',
        'grey-600': '#7A9585',
        'grey-700': '#5F7568',
        'grey-800': '#4A5D52',
        'grey-900': '#2F3D35',
        'royal-300': '#7AE5A8',
        'royal-400': '#5DD895',
        'royal-500': '#33C47C', // Peridot primary green
        'royal-600': '#2AA066',
        'royal-700': '#217C50',
        'status-positive': '#33C47C',
        'status-negative': '#FF4D5B',
        'status-partial': '#F3AF25',
        'button-lg-primary-bg': '#33C47C',
        'button-lg-primary-text': '#FFFFFF',
        'button-md-primary-bg': '#33C47C',
        'button-md-primary-text': '#FFFFFF',
        'button-sm-primary-bg': '#33C47C',
        'button-sm-primary-text': '#FFFFFF',
      },
    } as any
  }, [widgetThemeType])

  // Merge theme into a derived config that only changes when theme changes
  const squidConfig = useMemo(() => {
    return { ...baseSquidConfigRef.current, themeType: widgetThemeType, theme: themeOverrides }
  }, [widgetThemeType, themeOverrides])

  return (
    <>
      {/* Puts the user's Privy wallet into the widget's own wallet picker.
          Mounted here rather than app-wide: the announcement is one-way, so we
          make it only on the surface that needs it. */}
      <PeridotWalletAnnouncer />

      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">Swap / Bridge</h1>
        <a 
          href="#what-is" 
          className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Learn about cross-chain bridges →
        </a>
      </div>

      <div className="flex justify-center">
        <SquidWidgetWrapper 
          config={squidConfig} 
          className={className}
          widgetThemeType={widgetThemeType}
        />
      </div>

      {/* Quick jump chips + article (server-rendered) */}
      <BridgeArticle />
    </>
  )
}

export default BridgeComponent 