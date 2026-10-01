"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw, MessageSquare, Wallet, AlertTriangle } from "lucide-react"

interface SupportSessionRow {
  id: string
  walletAddress: string | null
  hubChainId: number | null
  isActive: boolean
  needsHuman: boolean
  createdAt: string
  updatedAt: string
  messageCount: number
  lastSenderType: "user" | "team" | "agent" | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
}

type Filter = "all" | "active" | "needs_human" | "inactive"

const SHORT_ADDR = (a: string | null) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "anonymous"

const fmt = (iso: string | null) => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function UgamauSessionsPage() {
  const [sessions, setSessions] = useState<SupportSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/ugamau/sessions", {
        credentials: "include",
      })
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/create/ugamau"
          return
        }
        throw new Error(`Failed (${res.status})`)
      }
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  const filtered = useMemo(() => {
    if (filter === "all") return sessions
    if (filter === "active") return sessions.filter((s) => s.isActive)
    if (filter === "inactive") return sessions.filter((s) => !s.isActive)
    return sessions.filter((s) => s.needsHuman)
  }, [sessions, filter])

  const counts = useMemo(
    () => ({
      all: sessions.length,
      active: sessions.filter((s) => s.isActive).length,
      needs_human: sessions.filter((s) => s.needsHuman).length,
      inactive: sessions.filter((s) => !s.isActive).length,
    }),
    [sessions],
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Support inbox</h1>
          <p className="text-muted-foreground">
            Live + closed Peridot support sessions. Click a row to read the conversation.
          </p>
        </div>
        <Button onClick={fetchSessions} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center flex-wrap">
            <Label htmlFor="filter">Filter:</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-56" id="filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({counts.all})</SelectItem>
                <SelectItem value="active">Active ({counts.active})</SelectItem>
                <SelectItem value="needs_human">
                  Needs human ({counts.needs_human})
                </SelectItem>
                <SelectItem value="inactive">Closed ({counts.inactive})</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {filtered.length} of {sessions.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <Button onClick={fetchSessions} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No sessions match this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/admin/create/ugamau/sessions/${s.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                        <code className="font-mono text-sm">{SHORT_ADDR(s.walletAddress)}</code>
                        {s.hubChainId != null && (
                          <Badge variant="outline">chain {s.hubChainId}</Badge>
                        )}
                        {s.needsHuman && (
                          <Badge className="bg-amber-500 text-white border-transparent">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Needs human
                          </Badge>
                        )}
                        {!s.isActive && <Badge variant="secondary">Closed</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {s.lastSenderType ? (
                          <>
                            <span className="font-medium text-foreground capitalize">
                              {s.lastSenderType}:
                            </span>{" "}
                            {s.lastMessagePreview ?? "—"}
                          </>
                        ) : (
                          <span className="italic">No messages yet</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end text-xs text-muted-foreground shrink-0 gap-1">
                      <span>{fmt(s.lastMessageAt ?? s.updatedAt)}</span>
                      <span className="text-[11px]">{s.messageCount} msg</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
