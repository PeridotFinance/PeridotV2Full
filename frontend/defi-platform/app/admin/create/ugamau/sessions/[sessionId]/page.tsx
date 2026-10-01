"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface SessionDetail {
  id: string
  walletAddress: string | null
  hubChainId: number | null
  isActive: boolean
  needsHuman: boolean
  createdAt: string
  updatedAt: string
  messages: Array<{
    id: number
    senderType: "user" | "team" | "agent"
    content: string
    createdAt: string
  }>
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const senderLabel = (s: "user" | "team" | "agent") =>
  s === "user" ? "User" : s === "agent" ? "Assistant" : "Team"

export default function UgamauSessionDetailPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId
  const [data, setData] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ugamau/sessions/${sessionId}`, {
        credentials: "include",
      })
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/create/ugamau"
          return
        }
        throw new Error(`Failed (${res.status})`)
      }
      const json = await res.json()
      setData(json.session)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <Link href="/admin/create/ugamau/sessions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to inbox
          </Button>
        </Link>
        <Button onClick={fetchDetail} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <Button onClick={fetchDetail} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !data ? (
        <p className="text-muted-foreground">Session not found.</p>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <code className="font-mono text-xs text-muted-foreground">
                  {data.id}
                </code>
                {data.needsHuman && (
                  <Badge className="bg-amber-500 text-white border-transparent">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Needs human
                  </Badge>
                )}
                {!data.isActive && <Badge variant="secondary">Closed</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Wallet</div>
                  <div className="font-mono">
                    {data.walletAddress ?? <span className="italic">anonymous</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Chain</div>
                  <div>{data.hubChainId ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Started</div>
                  <div>{fmtTime(data.createdAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Last update</div>
                  <div>{fmtTime(data.updatedAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              {data.messages.length === 0 ? (
                <p className="text-muted-foreground italic text-center py-8">
                  No messages in this session.
                </p>
              ) : (
                data.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col gap-1",
                      m.senderType === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <span>{senderLabel(m.senderType)}</span>
                      <span>·</span>
                      <span>{fmtTime(m.createdAt)}</span>
                    </div>
                    <div
                      className={cn(
                        "p-3 rounded-2xl text-sm break-words max-w-[85%] shadow-sm",
                        m.senderType === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : m.senderType === "agent"
                            ? "bg-primary/5 border border-primary/10 rounded-tl-none"
                            : "bg-muted rounded-tl-none",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
