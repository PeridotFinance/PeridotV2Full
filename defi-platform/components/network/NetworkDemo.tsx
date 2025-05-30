"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { NetworkSwitcher } from "./NetworkSwitcher"
import { NetworkStatusBadge } from "./NetworkStatusBadge"
import { supportedNetworks, networkContracts } from "../../config/networks"
import { useAccount } from "wagmi"
import { Globe, Check, AlertTriangle } from "lucide-react"

export function NetworkDemo() {
  const { chain, isConnected } = useAccount()

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Network Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current Status</p>
            <p className="text-xs text-muted-foreground">Your connected network</p>
          </div>
          <div className="flex items-center gap-2">
            <NetworkStatusBadge />
            <NetworkSwitcher variant="compact" />
          </div>
        </div>

        {/* Network Switcher */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Switch Networks</p>
          <NetworkSwitcher />
        </div>

        {/* Supported Networks Overview */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Supported Networks</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {supportedNetworks.map((network) => {
              const isCurrentNetwork = chain?.id === network.id
              const config = networkContracts[network.id]
              
              return (
                <div
                  key={network.id}
                  className={`p-3 border rounded-lg ${
                    isCurrentNetwork ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        isCurrentNetwork ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <span className="font-medium text-sm">{network.name}</span>
                      {isCurrentNetwork && <Check className="h-3 w-3 text-green-500" />}
                    </div>
                    {network.testnet && (
                      <Badge variant="outline" className="text-xs">Testnet</Badge>
                    )}
                  </div>
                  
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>Chain ID: {network.id}</p>
                    <p>Native: {network.nativeCurrency.symbol}</p>
                    <p className="truncate">Peridottroller: {
                      (() => {
                        if ('peridottrollerG7Proxy' in config && config.peridottrollerG7Proxy) {
                          return config.peridottrollerG7Proxy;
                        }
                        if ('unitrollerProxy' in config && config.unitrollerProxy) {
                          return config.unitrollerProxy;
                        }
                        return 'N/A';
                      })()
                    }</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Connection Instructions */}
        {!isConnected && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Connect your wallet to switch networks
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Use the "Connect Wallet" button to get started
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 