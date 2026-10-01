"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  GripVertical,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EditableBlock {
  id: string
  afterSectionIndex: number
  block: any
  expanded: boolean
}

interface Props {
  sections: Array<{ heading: string; sentences: string[]; callout?: string }>
  blocks: EditableBlock[]
  onBlocksChange: (blocks: EditableBlock[]) => void
  articleTitle: string
  articleExcerpt: string
  articlePath: string
  articleSummary?: string
  articlePrimaryKeyword?: string
}

// ── Block type config ─────────────────────────────────────────────────────────

const BLOCK_TYPES = [
  { value: "calculator",           label: "Calculator" },
  { value: "predict",              label: "Predict Quiz" },
  { value: "checkpoint",          label: "Checkpoint Quiz" },
  { value: "jenga",                label: "Jenga (Collateral)" },
  { value: "vault-builder",       label: "Vault Builder" },
  { value: "borrowing-power",     label: "Borrowing Power" },
  { value: "leverage-seesaw",     label: "Leverage Seesaw" },
  { value: "rate-highway",        label: "Rate Highway" },
  { value: "liquidation-dominoes", label: "Liquidation Dominoes" },
  { value: "apy-snowball",        label: "APY Snowball" },
  { value: "position-builder",    label: "Position Builder" },
]

const BLOCK_TYPE_COLORS: Record<string, string> = {
  "calculator":           "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "predict":              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "checkpoint":          "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "jenga":                "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "vault-builder":       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "borrowing-power":     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "leverage-seesaw":     "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "rate-highway":        "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "liquidation-dominoes": "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "apy-snowball":        "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "position-builder":    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
}

function blockLabel(block: any): string {
  const base = BLOCK_TYPES.find((t) => t.value === block?.type)?.label ?? block?.type ?? "?"
  if (block?.type === "calculator" && block?.variant) return `${base}: ${block.variant}`
  return base
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function defaultBlock(type: string): any {
  switch (type) {
    case "calculator":           return { type, variant: "health-factor" }
    case "predict":              return { type, prompt: "", options: ["", "", "", ""], correctIndex: 0, reveal: "" }
    case "checkpoint":          return { type, question: "", options: [{ text: "", correct: true, explanation: "" }, { text: "", correct: false, explanation: "" }] }
    case "jenga":                return { type, loanAmount: 800, liqLtv: 0.8, initialBlocks: 9 }
    case "vault-builder":       return { type, initialCoins: ["eth", "usdc"], targetCollateral: 5000 }
    case "borrowing-power":     return { type, assets: ["eth", "usdc"] }
    case "leverage-seesaw":     return { type, maxLeverage: 5 }
    case "rate-highway":        return { type, kinkUtilization: 0.8 }
    case "liquidation-dominoes": return { type }
    case "apy-snowball":        return { type, rate: 0.24, months: 12 }
    case "position-builder":    return { type }
    default:                    return { type }
  }
}

// ── Parameter editors per block type ─────────────────────────────────────────

function BlockParamsEditor({
  block,
  onChange,
}: {
  block: any
  onChange: (updated: any) => void
}) {
  const set = (field: string, value: any) => onChange({ ...block, [field]: value })

  switch (block?.type) {
    case "calculator":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Variante</Label>
            <Select value={block.variant ?? "health-factor"} onValueChange={(v) => set("variant", v)}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="health-factor">Health Factor</SelectItem>
                <SelectItem value="apy-vs-apr">APY vs APR</SelectItem>
                <SelectItem value="yield-return">Yield Return</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input
              className="h-8 text-xs mt-1"
              value={block.label ?? ""}
              onChange={(e) => set("label", e.target.value || undefined)}
              placeholder="z.B. Health Factor Explorer"
            />
          </div>
        </div>
      )

    case "jenga":
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Loan Amount ($)</Label>
            <Input
              type="number"
              className="h-8 text-xs mt-1"
              value={block.loanAmount ?? 800}
              onChange={(e) => set("loanAmount", Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Liq. LTV (0–1)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.5"
              max="0.95"
              className="h-8 text-xs mt-1"
              value={block.liqLtv ?? 0.8}
              onChange={(e) => set("liqLtv", Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Blöcke (Anzahl)</Label>
            <Input
              type="number"
              min="3"
              max="20"
              className="h-8 text-xs mt-1"
              value={block.initialBlocks ?? 9}
              onChange={(e) => set("initialBlocks", Number(e.target.value))}
            />
          </div>
        </div>
      )

    case "apy-snowball":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rate (z.B. 0.24 = 24%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max="2"
              className="h-8 text-xs mt-1"
              value={block.rate ?? 0.24}
              onChange={(e) => set("rate", Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Monate</Label>
            <Input
              type="number"
              min="1"
              max="60"
              className="h-8 text-xs mt-1"
              value={block.months ?? 12}
              onChange={(e) => set("months", Number(e.target.value))}
            />
          </div>
        </div>
      )

    case "leverage-seesaw":
      return (
        <div>
          <Label className="text-xs">Max. Leverage (2–20)</Label>
          <Input
            type="number"
            min="2"
            max="20"
            className="h-8 text-xs mt-1 w-32"
            value={block.maxLeverage ?? 5}
            onChange={(e) => set("maxLeverage", Number(e.target.value))}
          />
        </div>
      )

    case "rate-highway":
      return (
        <div>
          <Label className="text-xs">Kink Utilization (0–1, z.B. 0.8 = 80%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0.3"
            max="0.99"
            className="h-8 text-xs mt-1 w-32"
            value={block.kinkUtilization ?? 0.8}
            onChange={(e) => set("kinkUtilization", Number(e.target.value))}
          />
        </div>
      )

    case "vault-builder": {
      const coins: Array<"eth" | "btc" | "usdc"> = Array.isArray(block.initialCoins) ? block.initialCoins : ["eth", "usdc"]
      const toggleCoin = (coin: "eth" | "btc" | "usdc") => {
        const next = coins.includes(coin) ? coins.filter((c) => c !== coin) : [...coins, coin]
        set("initialCoins", next.length > 0 ? next : ["usdc"])
      }
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Startvermögen</Label>
            <div className="flex gap-2 mt-1">
              {(["eth", "btc", "usdc"] as const).map((coin) => (
                <button
                  key={coin}
                  type="button"
                  onClick={() => toggleCoin(coin)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${
                    coins.includes(coin)
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {coin.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Ziel-Collateral ($)</Label>
            <Input
              type="number"
              className="h-8 text-xs mt-1 w-36"
              value={block.targetCollateral ?? 5000}
              onChange={(e) => set("targetCollateral", Number(e.target.value))}
            />
          </div>
        </div>
      )
    }

    case "borrowing-power": {
      const assets: Array<"eth" | "btc" | "usdc"> = Array.isArray(block.assets) ? block.assets : ["eth", "usdc"]
      const toggleAsset = (a: "eth" | "btc" | "usdc") => {
        const next = assets.includes(a) ? assets.filter((x) => x !== a) : [...assets, a]
        set("assets", next.length > 0 ? next : ["usdc"])
      }
      return (
        <div>
          <Label className="text-xs">Collateral-Mix</Label>
          <div className="flex gap-2 mt-1">
            {(["eth", "btc", "usdc"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggleAsset(a)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${
                  assets.includes(a)
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border"
                }`}
              >
                {a.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )
    }

    case "predict": {
      const options: string[] = Array.isArray(block.options) ? block.options : ["", "", "", ""]
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Frage / Prompt</Label>
            <Textarea
              className="text-xs mt-1 min-h-[56px] resize-none"
              value={block.prompt ?? ""}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder="Was passiert wenn..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Antwortoptionen (richtige = grün markiert)</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set("correctIndex", i)}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                    block.correctIndex === i
                      ? "border-green-500 bg-green-500"
                      : "border-border bg-background"
                  }`}
                />
                <Input
                  className="h-7 text-xs"
                  value={opt}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = e.target.value
                    set("options", next)
                  }}
                  placeholder={`Option ${i + 1}`}
                />
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">Erklärung (nach Aufdecken)</Label>
            <Textarea
              className="text-xs mt-1 min-h-[56px] resize-none"
              value={block.reveal ?? ""}
              onChange={(e) => set("reveal", e.target.value)}
              placeholder="Die richtige Antwort ist ... weil ..."
            />
          </div>
        </div>
      )
    }

    case "checkpoint": {
      const options: Array<{ text: string; correct: boolean; explanation: string }> =
        Array.isArray(block.options) ? block.options : [
          { text: "", correct: true, explanation: "" },
          { text: "", correct: false, explanation: "" },
        ]
      const updateOption = (i: number, field: string, value: any) => {
        const next = options.map((o, idx) =>
          idx === i ? { ...o, [field]: value } : field === "correct" && value ? { ...o, correct: false } : o
        )
        set("options", next)
      }
      const addOption = () => set("options", [...options, { text: "", correct: false, explanation: "" }])
      const removeOption = (i: number) => set("options", options.filter((_, idx) => idx !== i))

      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Frage</Label>
            <Textarea
              className="text-xs mt-1 min-h-[56px] resize-none"
              value={block.question ?? ""}
              onChange={(e) => set("question", e.target.value)}
              placeholder="Welche Aussage ist korrekt?"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Antwortoptionen</Label>
            {options.map((opt, i) => (
              <div key={i} className="rounded border p-2 space-y-1.5 bg-muted/20">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateOption(i, "correct", true)}
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                      opt.correct
                        ? "border-green-500 bg-green-500"
                        : "border-border bg-background"
                    }`}
                  />
                  <Input
                    className="h-7 text-xs flex-1"
                    value={opt.text}
                    onChange={(e) => updateOption(i, "text", e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  className="h-7 text-xs"
                  value={opt.explanation}
                  onChange={(e) => updateOption(i, "explanation", e.target.value)}
                  placeholder="Erklärung für diese Option..."
                />
              </div>
            ))}
            {options.length < 5 && (
              <button
                type="button"
                onClick={addOption}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Option hinzufügen
              </button>
            )}
          </div>
        </div>
      )
    }

    case "liquidation-dominoes":
    case "position-builder":
      return (
        <p className="text-xs text-muted-foreground italic">
          Diese Komponente hat keine konfigurierbaren Parameter.
        </p>
      )

    default:
      return (
        <p className="text-xs text-muted-foreground italic">Unbekannter Block-Typ.</p>
      )
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function InteractiveBlockBuilder({
  sections,
  blocks,
  onBlocksChange,
  articleTitle,
  articleExcerpt,
  articlePath,
  articleSummary,
  articlePrimaryKeyword,
}: Props) {
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  const handleSuggest = async () => {
    if (sections.length === 0) return
    setSuggesting(true)
    setSuggestError(null)
    try {
      const res = await fetch("/api/blog/suggest-interactive-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: articleTitle,
          excerpt: articleExcerpt,
          summary: articleSummary ?? articleExcerpt,
          primaryKeyword: articlePrimaryKeyword ?? articleTitle,
          path: articlePath,
          sections,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Vorschlag fehlgeschlagen")
      const placements: Array<{ afterSectionIndex: number; block: any }> = Array.isArray(data.placements) ? data.placements : []
      if (placements.length === 0) {
        setSuggestError("Kein geeigneter Block für diesen Artikel gefunden.")
        return
      }
      onBlocksChange(
        placements.map((p) => ({
          id: uid(),
          afterSectionIndex: p.afterSectionIndex,
          block: p.block,
          expanded: false,
        }))
      )
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setSuggesting(false)
    }
  }

  const addBlock = () => {
    onBlocksChange([
      ...blocks,
      {
        id: uid(),
        afterSectionIndex: Math.max(0, sections.length - 1),
        block: defaultBlock("calculator"),
        expanded: true,
      },
    ])
  }

  const removeBlock = (id: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== id))
  }

  const toggleExpanded = (id: string) => {
    onBlocksChange(blocks.map((b) => (b.id === id ? { ...b, expanded: !b.expanded } : b)))
  }

  const updateBlockType = (id: string, type: string) => {
    onBlocksChange(
      blocks.map((b) => (b.id === id ? { ...b, block: defaultBlock(type), expanded: true } : b))
    )
  }

  const updateBlockParams = (id: string, updatedBlock: any) => {
    onBlocksChange(blocks.map((b) => (b.id === id ? { ...b, block: updatedBlock } : b)))
  }

  const updatePosition = (id: string, afterSectionIndex: number) => {
    onBlocksChange(blocks.map((b) => (b.id === id ? { ...b, afterSectionIndex } : b)))
  }

  // Sort for display: by afterSectionIndex
  const sorted = [...blocks].sort((a, b) => a.afterSectionIndex - b.afterSectionIndex)

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Interaktive Lernblöcke</span>
          {blocks.length > 0 && (
            <span className="text-[11px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-medium">
              {blocks.length}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSuggest}
          disabled={suggesting || sections.length === 0}
          className="h-7 text-xs gap-1.5"
        >
          {suggesting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          KI-Vorschlag
        </Button>
      </div>

      {suggestError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{suggestError}</p>
      )}

      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Artikel muss erst Abschnitte haben, bevor Blöcke platziert werden können.
        </p>
      )}

      {/* Block list */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((eb) => {
            const color = BLOCK_TYPE_COLORS[eb.block?.type] ?? "bg-muted text-muted-foreground"
            const sectionLabel = sections[eb.afterSectionIndex]?.heading
              ? `"${sections[eb.afterSectionIndex].heading}"`
              : `Abschnitt ${eb.afterSectionIndex + 1}`

            return (
              <div key={eb.id} className="rounded-lg border bg-background overflow-hidden">
                {/* Block header row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />

                  {/* Type badge */}
                  <span className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${color}`}>
                    {blockLabel(eb.block)}
                  </span>

                  {/* Position selector */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground flex-shrink-0">nach</span>
                    <Select
                      value={String(eb.afterSectionIndex)}
                      onValueChange={(v) => updatePosition(eb.id, Number(v))}
                    >
                      <SelectTrigger className="h-6 text-xs border-dashed flex-1 min-w-0">
                        <SelectValue>
                          <span className="truncate">{sectionLabel}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s, i) => (
                          <SelectItem key={i} value={String(i)} className="text-xs">
                            {i + 1}. {s.heading}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Expand / delete */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(eb.id)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    {eb.expanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(eb.id)}
                    className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Expanded: type selector + param editor */}
                {eb.expanded && (
                  <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-muted/10">
                    <div>
                      <Label className="text-xs">Block-Typ</Label>
                      <Select
                        value={eb.block?.type ?? "calculator"}
                        onValueChange={(v) => updateBlockType(eb.id, v)}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BLOCK_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <BlockParamsEditor
                      block={eb.block}
                      onChange={(updated) => updateBlockParams(eb.id, updated)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add button */}
      {sections.length > 0 && (
        <button
          type="button"
          onClick={addBlock}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-2 transition-colors hover:border-foreground/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Block manuell hinzufügen
        </button>
      )}
    </div>
  )
}
