"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, Shield, Link as LinkIcon, Zap } from "lucide-react"
import { Separator } from "@/components/ui/separator"

export function RiskDisclosure() {
  const risks = [
    {
      id: "smart-contract",
      title: "Smart Contract Risk",
      icon: Shield,
      description: "All treasury operations rely on audited smart contracts. While audits reduce risk, they cannot eliminate all potential vulnerabilities.",
      severity: "medium"
    },
    {
      id: "protocol-dependency",
      title: "Protocol Dependency",
      icon: LinkIcon,
      description: "Yield generation depends on underlying lending protocols. Protocol failures or exploits could impact treasury assets.",
      severity: "medium"
    },
    {
      id: "bridge-risk",
      title: "Bridge Risk",
      icon: Zap,
      description: "Cross-chain operations use bridge infrastructure. Bridge failures or exploits could affect asset transfers between chains.",
      severity: "low"
    }
  ]

  return (
    <div className="space-y-4">
      {risks.map((risk, index) => {
        const Icon = risk.icon
        return (
          <div key={risk.id}>
            <Alert variant={risk.severity === "medium" ? "default" : "secondary"}>
              <Icon className="h-4 w-4" />
              <AlertTitle className="text-sm font-medium">{risk.title}</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {risk.description}
              </AlertDescription>
            </Alert>
            {index < risks.length - 1 && <Separator className="my-4" />}
          </div>
        )
      })}
      
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> This interface provides access to on-chain treasury management tools. 
          All operations are executed on-chain and are irreversible. Always verify transaction details 
          before confirming. This is not financial advice.
        </p>
      </div>
    </div>
  )
}









