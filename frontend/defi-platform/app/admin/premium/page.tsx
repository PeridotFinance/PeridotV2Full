'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Star, Plus, Trash2, RefreshCw, ShieldCheck, Settings,
  AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PremiumUser {
  id: number
  wallet_address: string
  normalized_address: string
  tier: string
  is_override: boolean
  min_supply_usd: number | null
  granted_at: string
  expires_at: string | null
  granted_by: string | null
  notes: string | null
}

interface BoostConfig {
  tier: string
  boost_pct: number
  min_supply_usd: number | null
  is_active: boolean
  updated_at: string
  updated_by: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  top1: '#1 Leaderboard', top2: '#2 Leaderboard',
  top3: '#3 Leaderboard', premium: 'Premium',
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function adminHeaders(password: string) {
  return { 'Content-Type': 'application/json', 'x-admin-password': password }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPremiumPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)

  const [premiumUsers, setPremiumUsers] = useState<PremiumUser[]>([])
  const [boostConfigs, setBoostConfigs] = useState<BoostConfig[]>([])
  const [loading, setLoading] = useState(false)

  // Add premium user form
  const [addWallet, setAddWallet] = useState('')
  const [addSupply, setAddSupply] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [adding, setAdding] = useState(false)

  // Boost config edit
  const [editingTier, setEditingTier] = useState<string | null>(null)
  const [editPct, setEditPct] = useState('')
  const [editMinSupply, setEditMinSupply] = useState('')
  const [savingTier, setSavingTier] = useState(false)

  // ── Data loading ──

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, configRes] = await Promise.all([
        fetch('/api/admin/premium/users', { headers: adminHeaders(password) }),
        fetch('/api/admin/boost-config', { headers: adminHeaders(password) }),
      ])

      if (usersRes.status === 401 || configRes.status === 401) {
        toast.error('Wrong password')
        setAuthed(false)
        return
      }

      const [usersData, configData] = await Promise.all([usersRes.json(), configRes.json()])
      setPremiumUsers(usersData.users ?? [])
      setBoostConfigs(configData.configs ?? [])
      setAuthed(true)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [password])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    await loadData()
  }

  // ── Add premium user ──

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addWallet.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error('Invalid wallet address')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/admin/premium/users', {
        method: 'POST',
        headers: adminHeaders(password),
        body: JSON.stringify({
          walletAddress: addWallet,
          minSupplyUsd: addSupply ? parseFloat(addSupply) : 0,
          isOverride: true,
          notes: addNotes || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed')
      }
      toast.success('Premium granted', { description: shortAddr(addWallet) })
      setAddWallet('')
      setAddSupply('')
      setAddNotes('')
      await loadData()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  // ── Remove premium user ──

  const handleRemove = async (wallet: string) => {
    if (!confirm(`Revoke premium for ${shortAddr(wallet)}?`)) return
    try {
      const res = await fetch('/api/admin/premium/users', {
        method: 'DELETE',
        headers: adminHeaders(password),
        body: JSON.stringify({ walletAddress: wallet }),
      })
      if (!res.ok) throw new Error('Failed to revoke')
      toast.success('Premium revoked')
      await loadData()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // ── Boost config save ──

  const handleSaveTier = async (tier: string) => {
    const pct = parseFloat(editPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Boost % must be 0–100')
      return
    }
    setSavingTier(true)
    try {
      const res = await fetch('/api/admin/boost-config', {
        method: 'PUT',
        headers: adminHeaders(password),
        body: JSON.stringify({
          tier,
          boostPct: pct,
          minSupplyUsd: editMinSupply ? parseFloat(editMinSupply) : null,
          updatedBy: 'admin',
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success(`${TIER_LABELS[tier] ?? tier} updated to +${pct}%`)
      setEditingTier(null)
      await loadData()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingTier(false)
    }
  }

  // ── Auth gate ──

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm bg-card/80 border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <CardTitle className="text-lg">Admin Access</CardTitle>
            </div>
            <CardDescription>Premium user management</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pw">Admin password</Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-background/60"
                />
              </div>
              <Button type="submit" className="w-full" disabled={!password}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main UI ──

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Star className="w-5 h-5 text-emerald-400" />
            Premium Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Grant/revoke premium status and configure boost percentages.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Boost config */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Boost Tiers
          </CardTitle>
          <CardDescription className="text-xs">
            % applied to each tier's MERKL earnings. Paid in USDC from Peridot revenue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {boostConfigs.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No config found — run the migration first.
            </p>
          )}
          {boostConfigs.map(cfg => (
            <div key={cfg.tier} className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                onClick={() => {
                  if (editingTier === cfg.tier) {
                    setEditingTier(null)
                  } else {
                    setEditingTier(cfg.tier)
                    setEditPct(String(cfg.boost_pct))
                    setEditMinSupply(cfg.min_supply_usd ? String(cfg.min_supply_usd) : '')
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {TIER_LABELS[cfg.tier] ?? cfg.tier}
                  </span>
                  {cfg.min_supply_usd && (
                    <span className="text-xs text-muted-foreground">
                      ≥ ${Number(cfg.min_supply_usd).toLocaleString()} supplied
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-emerald-400">
                    +{cfg.boost_pct}%
                  </span>
                  {editingTier === cfg.tier
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
              </div>

              {editingTier === cfg.tier && (
                <div className="px-4 pb-4 pt-1 border-t border-border/30 bg-background/20">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Boost % <span className="text-muted-foreground">(0–100)</span></Label>
                      <Input
                        type="number"
                        step="0.25"
                        min="0"
                        max="100"
                        value={editPct}
                        onChange={e => setEditPct(e.target.value)}
                        className="h-8 text-sm bg-background/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Min supply USD <span className="text-muted-foreground">(optional)</span></Label>
                      <Input
                        type="number"
                        step="50"
                        min="0"
                        value={editMinSupply}
                        onChange={e => setEditMinSupply(e.target.value)}
                        placeholder="e.g. 500"
                        className="h-8 text-sm bg-background/60"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveTier(cfg.tier)}
                      disabled={savingTier}
                      className="h-8 text-xs"
                    >
                      {savingTier
                        ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        : <CheckCircle2 className="w-3 h-3 mr-1" />
                      }
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTier(null)}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      Last updated by {cfg.updated_by ?? '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Grant premium */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground" />
            Grant Premium
          </CardTitle>
          <CardDescription className="text-xs">
            Manually grant premium to any address. Overrides supply threshold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Wallet address</Label>
              <Input
                value={addWallet}
                onChange={e => setAddWallet(e.target.value)}
                placeholder="0x…"
                className="font-mono text-sm bg-background/60"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Supply snapshot USD <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  type="number"
                  value={addSupply}
                  onChange={e => setAddSupply(e.target.value)}
                  placeholder="e.g. 1200"
                  className="text-sm bg-background/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  placeholder="Partner, VIP, etc."
                  className="text-sm bg-background/60"
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={adding || !addWallet} className="w-full">
              {adding
                ? <><Loader2 className="w-3 h-3 animate-spin mr-2" />Granting…</>
                : <><Star className="w-3 h-3 mr-2" />Grant Premium</>
              }
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Premium users list */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Active Premium Users
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {premiumUsers.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {premiumUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No premium users yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {premiumUsers.map(u => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg
                    bg-background/40 border border-border/30 hover:border-border/60 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-400/10 border border-emerald-400/20
                      flex items-center justify-center shrink-0">
                      <Star className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-foreground truncate">
                        {u.wallet_address}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {u.is_override && (
                          <span className="text-[10px] text-amber-400">manual override</span>
                        )}
                        {u.min_supply_usd && (
                          <span className="text-[10px] text-muted-foreground">
                            ${Number(u.min_supply_usd).toLocaleString()} supplied
                          </span>
                        )}
                        {u.notes && (
                          <span className="text-[10px] text-muted-foreground italic">{u.notes}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          since {new Date(u.granted_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 shrink-0"
                    onClick={() => handleRemove(u.wallet_address)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
