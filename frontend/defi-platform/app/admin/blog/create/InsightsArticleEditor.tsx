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
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react"
import type { EditableBlock } from "./InteractiveBlockBuilder"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EditableSection {
  id: string
  heading: string
  sentences: string[]
  callout: string
}

interface Props {
  sections: EditableSection[]
  onSectionsChange: (sections: EditableSection[]) => void
  blocks: EditableBlock[]
  onBlocksChange: (blocks: EditableBlock[]) => void
  articleTitle: string
  articleExcerpt: string
  articlePath: string
  articleSummary?: string
  articlePrimaryKeyword?: string
}

// ── Block type config (mirrors InteractiveBlockBuilder) ───────────────────────

const BLOCK_TYPES = [
  { value: "calculator",            label: "Calculator" },
  { value: "predict",               label: "Predict Quiz" },
  { value: "checkpoint",            label: "Checkpoint Quiz" },
  { value: "jenga",                 label: "Jenga (Collateral)" },
  { value: "vault-builder",        label: "Vault Builder" },
  { value: "borrowing-power",      label: "Borrowing Power" },
  { value: "leverage-seesaw",      label: "Leverage Seesaw" },
  { value: "rate-highway",         label: "Rate Highway" },
  { value: "liquidation-dominoes", label: "Liquidation Dominoes" },
  { value: "apy-snowball",         label: "APY Snowball" },
  { value: "position-builder",     label: "Position Builder" },
]

const BLOCK_COLORS: Record<string, string> = {
  "calculator":            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "predict":               "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  "checkpoint":            "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  "jenga":                 "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  "vault-builder":        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  "borrowing-power":      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  "leverage-seesaw":      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
  "rate-highway":         "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  "liquidation-dominoes": "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  "apy-snowball":         "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  "position-builder":     "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
}

function blockTypeLabel(block: any): string {
  const base = BLOCK_TYPES.find((t) => t.value === block?.type)?.label ?? block?.type ?? "?"
  if (block?.type === "calculator" && block?.variant) return `${base} · ${block.variant}`
  return base
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function defaultBlock(type: string): any {
  switch (type) {
    case "calculator":            return { type, variant: "health-factor" }
    case "predict":               return { type, prompt: "", options: ["", "", "", ""], correctIndex: 0, reveal: "" }
    case "checkpoint":            return { type, question: "", options: [{ text: "", correct: true, explanation: "" }, { text: "", correct: false, explanation: "" }] }
    case "jenga":                 return { type, loanAmount: 800, liqLtv: 0.8, initialBlocks: 9 }
    case "vault-builder":        return { type, initialCoins: ["eth", "usdc"], targetCollateral: 5000 }
    case "borrowing-power":      return { type, assets: ["eth", "usdc"] }
    case "leverage-seesaw":      return { type, maxLeverage: 5 }
    case "rate-highway":         return { type, kinkUtilization: 0.8 }
    case "liquidation-dominoes": return { type }
    case "apy-snowball":         return { type, rate: 0.24, months: 12 }
    case "position-builder":     return { type }
    default:                     return { type }
  }
}

// ── Block parameter editor ────────────────────────────────────────────────────

function BlockParamsEditor({ block, onChange }: { block: any; onChange: (b: any) => void }) {
  const set = (field: string, value: any) => onChange({ ...block, [field]: value })

  switch (block?.type) {
    case "calculator":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Variante</Label>
            <Select value={block.variant ?? "health-factor"} onValueChange={(v) => set("variant", v)}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="health-factor">Health Factor</SelectItem>
                <SelectItem value="apy-vs-apr">APY vs APR</SelectItem>
                <SelectItem value="yield-return">Yield Return</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input className="h-8 text-xs mt-1" value={block.label ?? ""} onChange={(e) => set("label", e.target.value || undefined)} placeholder="z.B. Health Factor Explorer" />
          </div>
        </div>
      )

    case "jenga":
      return (
        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">Loan ($)</Label><Input type="number" className="h-8 text-xs mt-1" value={block.loanAmount ?? 800} onChange={(e) => set("loanAmount", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Liq. LTV (0–1)</Label><Input type="number" step="0.01" min="0.5" max="0.95" className="h-8 text-xs mt-1" value={block.liqLtv ?? 0.8} onChange={(e) => set("liqLtv", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Blöcke</Label><Input type="number" min="3" max="20" className="h-8 text-xs mt-1" value={block.initialBlocks ?? 9} onChange={(e) => set("initialBlocks", Number(e.target.value))} /></div>
        </div>
      )

    case "apy-snowball":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Rate (z.B. 0.24 = 24%)</Label><Input type="number" step="0.01" min="0.01" max="2" className="h-8 text-xs mt-1" value={block.rate ?? 0.24} onChange={(e) => set("rate", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Monate</Label><Input type="number" min="1" max="60" className="h-8 text-xs mt-1" value={block.months ?? 12} onChange={(e) => set("months", Number(e.target.value))} /></div>
        </div>
      )

    case "leverage-seesaw":
      return (
        <div><Label className="text-xs">Max. Leverage (2–20)</Label><Input type="number" min="2" max="20" className="h-8 text-xs mt-1 w-28" value={block.maxLeverage ?? 5} onChange={(e) => set("maxLeverage", Number(e.target.value))} /></div>
      )

    case "rate-highway":
      return (
        <div><Label className="text-xs">Kink Utilization (0–1)</Label><Input type="number" step="0.01" min="0.3" max="0.99" className="h-8 text-xs mt-1 w-28" value={block.kinkUtilization ?? 0.8} onChange={(e) => set("kinkUtilization", Number(e.target.value))} /></div>
      )

    case "vault-builder": {
      const coins: Array<"eth"|"btc"|"usdc"> = Array.isArray(block.initialCoins) ? block.initialCoins : ["eth","usdc"]
      const toggle = (c: "eth"|"btc"|"usdc") => { const n = coins.includes(c) ? coins.filter(x=>x!==c) : [...coins,c]; set("initialCoins", n.length>0?n:["usdc"]) }
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Startvermögen</Label>
            <div className="flex gap-2 mt-1">{(["eth","btc","usdc"] as const).map(c=><button key={c} type="button" onClick={()=>toggle(c)} className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${coins.includes(c)?"bg-foreground text-background border-foreground":"bg-background text-muted-foreground border-border"}`}>{c.toUpperCase()}</button>)}</div>
          </div>
          <div><Label className="text-xs">Ziel-Collateral ($)</Label><Input type="number" className="h-8 text-xs mt-1 w-36" value={block.targetCollateral??5000} onChange={(e)=>set("targetCollateral",Number(e.target.value))} /></div>
        </div>
      )
    }

    case "borrowing-power": {
      const assets: Array<"eth"|"btc"|"usdc"> = Array.isArray(block.assets) ? block.assets : ["eth","usdc"]
      const toggle = (a: "eth"|"btc"|"usdc") => { const n = assets.includes(a) ? assets.filter(x=>x!==a) : [...assets,a]; set("assets", n.length>0?n:["usdc"]) }
      return (
        <div><Label className="text-xs">Collateral-Mix</Label><div className="flex gap-2 mt-1">{(["eth","btc","usdc"] as const).map(a=><button key={a} type="button" onClick={()=>toggle(a)} className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${assets.includes(a)?"bg-foreground text-background border-foreground":"bg-background text-muted-foreground border-border"}`}>{a.toUpperCase()}</button>)}</div></div>
      )
    }

    case "predict": {
      const options: string[] = Array.isArray(block.options) ? block.options : ["","","",""]
      return (
        <div className="space-y-3">
          <div><Label className="text-xs">Frage / Prompt</Label><Textarea className="text-xs mt-1 min-h-[52px] resize-none" value={block.prompt??""} onChange={(e)=>set("prompt",e.target.value)} placeholder="Was passiert wenn..." /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Antwortoptionen (● = richtig)</Label>
            {options.map((opt,i)=>(
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={()=>set("correctIndex",i)} className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${block.correctIndex===i?"border-green-500 bg-green-500":"border-border bg-background"}`} />
                <Input className="h-7 text-xs" value={opt} onChange={(e)=>{const n=[...options];n[i]=e.target.value;set("options",n)}} placeholder={`Option ${i+1}`} />
              </div>
            ))}
          </div>
          <div><Label className="text-xs">Erklärung (nach Aufdecken)</Label><Textarea className="text-xs mt-1 min-h-[52px] resize-none" value={block.reveal??""} onChange={(e)=>set("reveal",e.target.value)} placeholder="Die richtige Antwort ist..." /></div>
        </div>
      )
    }

    case "checkpoint": {
      const options: Array<{text:string;correct:boolean;explanation:string}> = Array.isArray(block.options) ? block.options : [{text:"",correct:true,explanation:""},{text:"",correct:false,explanation:""}]
      const upd = (i:number,f:string,v:any) => { const n = options.map((o,idx)=>idx===i?{...o,[f]:v}:f==="correct"&&v?{...o,correct:false}:o); set("options",n) }
      return (
        <div className="space-y-3">
          <div><Label className="text-xs">Frage</Label><Textarea className="text-xs mt-1 min-h-[52px] resize-none" value={block.question??""} onChange={(e)=>set("question",e.target.value)} placeholder="Welche Aussage ist korrekt?" /></div>
          <div className="space-y-2">
            <Label className="text-xs">Antwortoptionen</Label>
            {options.map((opt,i)=>(
              <div key={i} className="rounded border p-2 space-y-1.5 bg-muted/20">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={()=>upd(i,"correct",true)} className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${opt.correct?"border-green-500 bg-green-500":"border-border bg-background"}`} />
                  <Input className="h-7 text-xs flex-1" value={opt.text} onChange={(e)=>upd(i,"text",e.target.value)} placeholder={`Option ${i+1}`} />
                  {options.length>2&&<button type="button" onClick={()=>set("options",options.filter((_,idx)=>idx!==i))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5"/></button>}
                </div>
                <Input className="h-7 text-xs" value={opt.explanation} onChange={(e)=>upd(i,"explanation",e.target.value)} placeholder="Erklärung für diese Option..." />
              </div>
            ))}
            {options.length<5&&<button type="button" onClick={()=>set("options",[...options,{text:"",correct:false,explanation:""}])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3"/>Option hinzufügen</button>}
          </div>
        </div>
      )
    }

    case "liquidation-dominoes":
    case "position-builder":
      return <p className="text-xs text-muted-foreground italic">Keine konfigurierbaren Parameter.</p>

    default:
      return <p className="text-xs text-muted-foreground italic">Unbekannter Block-Typ.</p>
  }
}

// ── Block card (rendered between sections) ────────────────────────────────────

function BlockCard({
  eb,
  sectionHeading,
  onUpdate,
  onDelete,
}: {
  eb: EditableBlock
  sectionHeading: string
  onUpdate: (updated: EditableBlock) => void
  onDelete: () => void
}) {
  const color = BLOCK_COLORS[eb.block?.type] ?? "bg-muted text-muted-foreground border-border"

  return (
    <div className={`rounded-lg border ml-6 bg-background overflow-hidden ${color.split(" ").find(c=>c.startsWith("border")) ?? "border-border"}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color.split(" ")[0]}`} />
        <span className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${color}`}>
          {blockTypeLabel(eb.block)}
        </span>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          nach: <span className="italic">„{sectionHeading}"</span>
        </span>
        <button type="button" onClick={() => onUpdate({ ...eb, expanded: !eb.expanded })} className="text-muted-foreground hover:text-foreground">
          {eb.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded editor */}
      {eb.expanded && (
        <div className="px-3 pb-3 pt-2 space-y-3 border-t">
          <div>
            <Label className="text-xs">Block-Typ</Label>
            <Select value={eb.block?.type ?? "calculator"} onValueChange={(v) => onUpdate({ ...eb, block: defaultBlock(v), expanded: true })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOCK_TYPES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <BlockParamsEditor block={eb.block} onChange={(b) => onUpdate({ ...eb, block: b })} />
        </div>
      )}
    </div>
  )
}

// ── Add-block button ──────────────────────────────────────────────────────────

function AddBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors group"
    >
      <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground group-hover:border-violet-500 flex items-center justify-center transition-colors">
        <Plus className="h-3 w-3" />
      </div>
      Interaktiven Block hier einfügen
    </button>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  section,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  section: EditableSection
  index: number
  total: number
  onUpdate: (s: EditableSection) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const set = (field: keyof EditableSection, value: any) => onUpdate({ ...section, [field]: value })

  const updateSentence = (i: number, val: string) => {
    const next = [...section.sentences]
    next[i] = val
    set("sentences", next)
  }

  const addSentence = () => set("sentences", [...section.sentences, ""])

  const removeSentence = (i: number) => {
    if (section.sentences.length <= 1) return
    set("sentences", section.sentences.filter((_, idx) => idx !== i))
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground flex-1">
          Abschnitt {index + 1}
        </span>
        <button type="button" onClick={onMoveUp} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} disabled={total <= 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Section body */}
      <div className="p-3 space-y-3">
        {/* Heading */}
        <div>
          <Label className="text-xs text-muted-foreground">Überschrift</Label>
          <Input
            className="mt-1 h-8 text-sm font-medium"
            value={section.heading}
            onChange={(e) => set("heading", e.target.value)}
            placeholder="Abschnitts-Titel..."
          />
        </div>

        {/* Sentences */}
        <div>
          <Label className="text-xs text-muted-foreground">Sätze</Label>
          <div className="mt-1 space-y-1.5">
            {section.sentences.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground/50 w-3 flex-shrink-0 text-right">{i + 1}</span>
                <Input
                  className="h-8 text-xs flex-1"
                  value={s}
                  onChange={(e) => updateSentence(i, e.target.value)}
                  placeholder={`Satz ${i + 1}...`}
                />
                <button
                  type="button"
                  onClick={() => removeSentence(i)}
                  disabled={section.sentences.length <= 1}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30 flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {section.sentences.length < 4 && (
              <button
                type="button"
                onClick={addSentence}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground ml-5"
              >
                <Plus className="h-3 w-3" /> Satz hinzufügen
              </button>
            )}
          </div>
        </div>

        {/* Callout */}
        <div>
          <Label className="text-xs text-muted-foreground">
            Callout <span className="text-muted-foreground/50">(optional)</span>
          </Label>
          <Input
            className="mt-1 h-8 text-xs italic"
            value={section.callout}
            onChange={(e) => set("callout", e.target.value)}
            placeholder="Wichtiger Hinweis oder Merksatz..."
          />
        </div>
      </div>
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function InsightsArticleEditor({
  sections,
  onSectionsChange,
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

  // ── Section helpers ────────────────────────────────────────────────────────

  const updateSection = (id: string, updated: EditableSection) => {
    onSectionsChange(sections.map((s) => (s.id === id ? updated : s)))
  }

  const deleteSection = (id: string) => {
    if (sections.length <= 1) return
    const idx = sections.findIndex((s) => s.id === id)
    // Re-index blocks: remove blocks after the deleted section, shift others
    const newBlocks = blocks
      .filter((b) => b.afterSectionIndex !== idx)
      .map((b) => ({
        ...b,
        afterSectionIndex: b.afterSectionIndex > idx ? b.afterSectionIndex - 1 : b.afterSectionIndex,
      }))
    onSectionsChange(sections.filter((s) => s.id !== id))
    onBlocksChange(newBlocks)
  }

  const moveSection = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === id)
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= sections.length) return

    // Swap sections
    const next = [...sections]
    ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]

    // Re-map blocks: swap afterSectionIndex for idx and targetIdx
    const newBlocks = blocks.map((b) => {
      if (b.afterSectionIndex === idx) return { ...b, afterSectionIndex: targetIdx }
      if (b.afterSectionIndex === targetIdx) return { ...b, afterSectionIndex: idx }
      return b
    })

    onSectionsChange(next)
    onBlocksChange(newBlocks)
  }

  const addSection = () => {
    onSectionsChange([
      ...sections,
      { id: uid(), heading: "", sentences: [""], callout: "" },
    ])
  }

  // ── Block helpers ──────────────────────────────────────────────────────────

  const addBlockAfter = (sectionIndex: number) => {
    onBlocksChange([
      ...blocks,
      {
        id: uid(),
        afterSectionIndex: sectionIndex,
        block: defaultBlock("calculator"),
        expanded: true,
      },
    ])
  }

  const updateBlock = (id: string, updated: EditableBlock) => {
    onBlocksChange(blocks.map((b) => (b.id === id ? updated : b)))
  }

  const deleteBlock = (id: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== id))
  }

  // ── KI-Vorschlag ───────────────────────────────────────────────────────────

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
          // Use current (potentially edited) section content
          sections: sections.map((s) => ({
            heading: s.heading,
            sentences: s.sentences,
            callout: s.callout || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Vorschlag fehlgeschlagen")
      const placements: Array<{ afterSectionIndex: number; block: any }> =
        Array.isArray(data.placements) ? data.placements : []
      if (placements.length === 0) {
        setSuggestError("Kein geeigneter interaktiver Block für diesen Artikel gefunden.")
        return
      }
      // Replace existing blocks with AI suggestions
      onBlocksChange(
        placements.map((p) => ({
          id: uid(),
          afterSectionIndex: Math.min(p.afterSectionIndex, sections.length - 1),
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalBlocks = blocks.length

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Artikel-Struktur</span>
          <span className="text-xs text-muted-foreground">
            {sections.length} Abschnitt{sections.length !== 1 ? "e" : ""}
            {totalBlocks > 0 && ` · ${totalBlocks} Block${totalBlocks !== 1 ? "s" : ""}`}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSuggest}
          disabled={suggesting || sections.length === 0}
          className="h-7 text-xs gap-1.5"
        >
          {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          KI-Blockvorschlag
        </Button>
      </div>

      {suggestError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 px-1">{suggestError}</p>
      )}

      {/* Empty state */}
      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/20 dark:bg-violet-950/10 px-4 py-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Noch keine Abschnitte vorhanden.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">
            Generiere den Artikel mit KI — danach erscheinen die Abschnitte hier und können bearbeitet werden. Oder füge manuell einen ersten Abschnitt hinzu.
          </p>
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Ersten Abschnitt manuell erstellen
          </button>
        </div>
      )}

      {/* Article structure: sections interleaved with blocks */}
      <div className="space-y-2">
        {sections.map((section, idx) => {
          const blocksHere = blocks.filter((b) => b.afterSectionIndex === idx)

          return (
            <div key={section.id} className="space-y-2">
              {/* Section card */}
              <SectionCard
                section={section}
                index={idx}
                total={sections.length}
                onUpdate={(updated) => updateSection(section.id, updated)}
                onDelete={() => deleteSection(section.id)}
                onMoveUp={() => moveSection(section.id, -1)}
                onMoveDown={() => moveSection(section.id, 1)}
              />

              {/* Blocks placed after this section */}
              {blocksHere.map((eb) => (
                <BlockCard
                  key={eb.id}
                  eb={eb}
                  sectionHeading={section.heading || `Abschnitt ${idx + 1}`}
                  onUpdate={(updated) => updateBlock(eb.id, updated)}
                  onDelete={() => deleteBlock(eb.id)}
                />
              ))}

              {/* Add block after this section */}
              <AddBlockButton onClick={() => addBlockAfter(idx)} />
            </div>
          )
        })}
      </div>

      {/* Add section — only shown when there are already sections */}
      {sections.length > 0 && (
        <button
          type="button"
          onClick={addSection}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-2.5 transition-colors hover:border-foreground/30 mt-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Abschnitt hinzufügen
        </button>
      )}
    </div>
  )
}
