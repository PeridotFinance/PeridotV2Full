/**
 * RPC Call Logger for Debugging Rate Limiting Issues
 * 
 * This utility tracks all RPC calls made in the application to help identify:
 * - Duplicate calls
 * - Burst patterns
 * - Rate limiting triggers
 */

type RpcCallLog = {
  timestamp: number
  component: string
  function: string
  address?: string
  chainId?: number
  args?: any[]
  callId: string
  enabled: boolean
}

class RpcLogger {
  private logs: RpcCallLog[] = []
  private enabled: boolean = false
  private sessionStart: number = Date.now()

  constructor() {
    // Auto-enable for Monad chains
    if (typeof window !== 'undefined') {
      this.checkAutoEnable()
    }
  }

  private checkAutoEnable() {
    // Enable logging for Monad Mainnet (143) and Testnet (10143)
    const urlParams = new URLSearchParams(window.location.search)
    const debugRpc = urlParams.get('debugRpc')
    if (debugRpc === 'true' || debugRpc === '1') {
      this.enabled = true
      console.log('🔍 [RPC Logger] Enabled via query parameter')
    }
  }

  enable() {
    this.enabled = true
    this.sessionStart = Date.now()
    console.log('🔍 [RPC Logger] Enabled')
  }

  disable() {
    this.enabled = false
    console.log('🔍 [RPC Logger] Disabled')
  }

  isEnabled() {
    return this.enabled
  }

  logCall(params: {
    component: string
    function: string
    address?: string
    chainId?: number
    args?: any[]
    enabled?: boolean
  }) {
    if (!this.enabled) return

    const callId = `${params.component}:${params.function}:${params.address?.slice(0, 8)}`
    const log: RpcCallLog = {
      timestamp: Date.now(),
      component: params.component,
      function: params.function,
      address: params.address,
      chainId: params.chainId,
      args: params.args,
      callId,
      enabled: params.enabled ?? true,
    }

    this.logs.push(log)

    // Log to console with detailed info
    const elapsed = log.timestamp - this.sessionStart
    const enabledStr = log.enabled ? '✅' : '⏸️'
    console.log(
      `🌐 [RPC] ${enabledStr} [${elapsed}ms] ${log.component} → ${log.function}`,
      {
        address: log.address?.slice(0, 10) + '...' || 'N/A',
        chainId: log.chainId,
        args: log.args,
        callId: log.callId,
      }
    )
  }

  getStats() {
    if (!this.enabled) {
      console.warn('RPC Logger is not enabled')
      return null
    }

    const enabledCalls = this.logs.filter(log => log.enabled)
    const callsByComponent = new Map<string, number>()
    const callsByFunction = new Map<string, number>()
    const callsById = new Map<string, number>()

    enabledCalls.forEach(log => {
      callsByComponent.set(log.component, (callsByComponent.get(log.component) || 0) + 1)
      callsByFunction.set(log.function, (callsByFunction.get(log.function) || 0) + 1)
      callsById.set(log.callId, (callsById.get(log.callId) || 0) + 1)
    })

    // Find duplicates (same callId, same timeframe)
    const duplicates: Array<{ callId: string; count: number; timestamps: number[] }> = []
    const callsGrouped = new Map<string, number[]>()
    
    enabledCalls.forEach(log => {
      if (!callsGrouped.has(log.callId)) {
        callsGrouped.set(log.callId, [])
      }
      callsGrouped.get(log.callId)!.push(log.timestamp)
    })

    callsGrouped.forEach((timestamps, callId) => {
      if (timestamps.length > 1) {
        // Check if any calls happened within 100ms of each other (likely duplicates)
        for (let i = 1; i < timestamps.length; i++) {
          if (timestamps[i] - timestamps[i-1] < 100) {
            duplicates.push({
              callId,
              count: timestamps.length,
              timestamps,
            })
            break
          }
        }
      }
    })

    return {
      totalCalls: enabledCalls.length,
      disabledCalls: this.logs.length - enabledCalls.length,
      callsByComponent: Object.fromEntries(callsByComponent),
      callsByFunction: Object.fromEntries(callsByFunction),
      duplicates: duplicates.length > 0 ? duplicates : 'None detected',
      timeRange: {
        start: this.sessionStart,
        duration: Date.now() - this.sessionStart,
      },
      recentCalls: enabledCalls.slice(-20).map(log => ({
        time: new Date(log.timestamp).toISOString(),
        elapsed: log.timestamp - this.sessionStart,
        component: log.component,
        function: log.function,
        callId: log.callId,
      })),
    }
  }

  printStats() {
    const stats = this.getStats()
    if (!stats) return

    console.group('📊 RPC Call Statistics')
    console.log(`Total Enabled Calls: ${stats.totalCalls}`)
    console.log(`Disabled Calls: ${stats.disabledCalls}`)
    console.log(`Duration: ${(stats.timeRange.duration / 1000).toFixed(2)}s`)
    console.log('\n📦 Calls by Component:')
    console.table(stats.callsByComponent)
    console.log('\n🔧 Calls by Function:')
    console.table(stats.callsByFunction)
    
    if (Array.isArray(stats.duplicates) && stats.duplicates.length > 0) {
      console.warn('\n⚠️ Potential Duplicate Calls (within 100ms):')
      console.table(stats.duplicates)
    } else {
      console.log('\n✅ No duplicate calls detected')
    }

    console.log('\n📝 Recent Calls (last 20):')
    console.table(stats.recentCalls)
    console.groupEnd()
  }

  clear() {
    this.logs = []
    this.sessionStart = Date.now()
    console.log('🗑️ [RPC Logger] Cleared all logs')
  }

  exportLogs() {
    return {
      logs: this.logs,
      stats: this.getStats(),
    }
  }
}

// Global singleton instance
export const rpcLogger = new RpcLogger()

// Make it available in browser console for debugging
if (typeof window !== 'undefined') {
  (window as any).rpcLogger = rpcLogger
  console.log('💡 RPC Logger available: window.rpcLogger')
  console.log('   Commands: rpcLogger.enable(), rpcLogger.printStats(), rpcLogger.clear()')
}

