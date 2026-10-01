"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  Save,
  Loader2,
  CheckCircle2,
  Circle,
  AlertCircle,
  RotateCcw,
  BookOpen,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Pencil,
  FileText,
  Lightbulb,
  GraduationCap,
  FolderPlus,
} from "lucide-react"
import type { CurriculumChapter } from "@/app/api/blog/insights-curriculum/route"
import { InsightsArticleEditor, type EditableSection } from "./InsightsArticleEditor"
import type { EditableBlock } from "./InteractiveBlockBuilder"

// ── Types ─────────────────────────────────────────────────────────────────────

interface FAQItem {
  question: string
  answer: string
}

interface AdminPostSummary {
  id: number
  slug: string
  title: string
  excerpt?: string | null
  status: "draft" | "published"
  category?: string | null
  hasInsights: boolean
  publishedAt?: string | null
  updatedAt?: string | null
  insightsPath?: string | null
  insightsChapterOrder?: number | null
  insightsChapterTitle?: string | null
  insightsLessonOrder?: number | null
}

type StepStatus = "pending" | "in-progress" | "completed" | "error" | "skipped"

interface ProgressStep {
  id: string
  label: string
  status: StepStatus
  message?: string
}

interface GenerationCheckpoint {
  topicInput: { title: string; mode: string; insightsPath?: string }
  completedSteps: string[]
  partialData: Record<string, any>
  failedAt?: string
  startedAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENERATION_STEPS: { id: string; label: string }[] = [
  { id: "topic-plan",         label: "Topic-Validierung" },
  { id: "base-info",          label: "Basisinformationen" },
  { id: "article-content",    label: "Artikelinhalt" },
  { id: "interactive-blocks", label: "Interaktive Lernblöcke" },
  { id: "meta-info",          label: "SEO Meta-Tags" },
  { id: "faq",                label: "FAQ-Generierung" },
  { id: "cover-image",        label: "Cover-Bild" },
  { id: "concept-image",      label: "Konzeptbild" },
  { id: "explanations",       label: "Erklärungen" },
  { id: "fact-check",         label: "Faktenprüfung" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sectionsToEditable(
  raw: Array<{ heading: string; sentences: string[]; callout?: string }> | undefined
): EditableSection[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.map((s) => ({
    id: Math.random().toString(36).slice(2, 10),
    heading: s.heading ?? "",
    sentences: Array.isArray(s.sentences) && s.sentences.length > 0 ? s.sentences : [""],
    callout: s.callout ?? "",
  }))
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Fire-and-forget checkpoint save. Never awaited so it never blocks
 * the SSE reading loop.
 */
function saveCheckpoint(
  slug: string,
  checkpoint: GenerationCheckpoint | null,
  clear = false
): void {
  fetch("/api/blog/save-checkpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, checkpoint, clear }),
  }).catch((err) => console.warn("[checkpoint] save failed:", err))
}

// ── Step indicator component ──────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed" || status === "skipped") {
    return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
  }
  if (status === "in-progress") {
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
  }
  if (status === "error") {
    return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
  }
  return <Circle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
}

function GenerationProgress({ steps }: { steps: ProgressStep[] }) {
  if (steps.length === 0) return null
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground mb-3">Generierungsfortschritt</p>
      {steps.map((step) => (
        <div key={step.id} className="flex items-start gap-2.5">
          <StepIcon status={step.status} />
          <div className="min-w-0">
            <span
              className={`text-sm ${
                step.status === "in-progress"
                  ? "font-medium text-foreground"
                  : step.status === "completed" || step.status === "skipped"
                  ? "text-muted-foreground"
                  : step.status === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground/60"
              }`}
            >
              {step.label}
            </span>
            {step.message && step.status === "in-progress" && (
              <p className="text-xs text-muted-foreground truncate">{step.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateArticlePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  // Generation progress & checkpoint state
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([])
  const [checkpoint, setCheckpoint] = useState<GenerationCheckpoint | null>(null)
  const [checkpointSlug, setCheckpointSlug] = useState<string | null>(null)
  const [canResume, setCanResume] = useState(false)
  const [resumeLabel, setResumeLabel] = useState<string>("")

  // Article Library state
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryPosts, setLibraryPosts] = useState<AdminPostSummary[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryFilter, setLibraryFilter] = useState<"all" | "blog" | "insights">("all")
  const [libraryPathFilter, setLibraryPathFilter] = useState<string>("all")
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null) // slug being loaded

  // Content mode: 'blog' (default) or 'insights' (for Lernzentrum entries)
  const [contentMode, setContentMode] = useState<"blog" | "insights">("blog")
  const [insightsPath, setInsightsPath] = useState<"starter" | "yield" | "risk" | "market">("starter")

  // Curriculum positioning (insights mode only)
  const [chapterTitle, setChapterTitle] = useState("")
  const [chapterOrder, setChapterOrder] = useState<number>(1)
  const [lessonOrder, setLessonOrder] = useState<number>(1)

  // Live curriculum data fetched from DB when path changes
  const [curriculumChapters, setCurriculumChapters] = useState<CurriculumChapter[]>([])
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumExpanded, setCurriculumExpanded] = useState(false)
  // "existing" = add lesson to an existing chapter, "new" = create a new chapter
  const [chapterMode, setChapterMode] = useState<"existing" | "new">("new")
  const [selectedChapterSlug, setSelectedChapterSlug] = useState<string>("")

  // Insights draft data returned by the generation pipeline
  const [insightsDraft, setInsightsDraft] = useState<any>(null)
  // Interactive block builder + section editor state (authoritative source for saving)
  const [editableBlocks, setEditableBlocks] = useState<EditableBlock[]>([])
  const [editableSections, setEditableSections] = useState<EditableSection[]>([])

  // Basic fields
  const [title, setTitle] = useState(
    "Understanding DeFi Lending: A Complete Guide for Beginners"
  )
  const [slug, setSlug] = useState(
    "understanding-defi-lending-complete-guide-beginners"
  )
  const [excerpt, setExcerpt] = useState(
    "Learn everything you need to know about DeFi lending, from how it works to the best platforms and strategies for maximizing your returns."
  )
  const [content, setContent] = useState(`# Understanding DeFi Lending: A Complete Guide for Beginners

DeFi lending has revolutionized the way people interact with financial services. In this comprehensive guide, we'll explore everything you need to know about decentralized finance lending.

## What is DeFi Lending?

DeFi lending allows users to lend and borrow cryptocurrencies without traditional financial intermediaries. Instead of banks, smart contracts handle the entire process.

## How Does It Work?

1. **Supply Assets**: Users deposit their crypto assets into a lending pool
2. **Earn Interest**: Lenders earn interest on their deposits
3. **Borrow Against Collateral**: Borrowers can take out loans using their crypto as collateral
4. **Automated Management**: Smart contracts automatically manage interest rates and liquidations

## Key Benefits

- **No Middlemen**: Direct peer-to-peer lending through smart contracts
- **Global Access**: Available to anyone with an internet connection
- **Transparent**: All transactions are recorded on the blockchain
- **Flexible**: Borrow and lend 24/7 without restrictions

## Getting Started

To start lending or borrowing in DeFi, you'll need:

1. A cryptocurrency wallet (like MetaMask)
2. Some crypto assets to deposit
3. Understanding of the risks involved

## Conclusion

DeFi lending offers exciting opportunities but comes with risks. Always do your research and start with small amounts.`)
  const [status, setStatus] = useState<"draft" | "published">("draft")
  const [category, setCategory] = useState("Education")

  // Author fields
  const [authorName, setAuthorName] = useState("Alexander Meyer")
  const [authorUrl, setAuthorUrl] = useState("")
  const [authorPictureUrl, setAuthorPictureUrl] = useState("")
  const [authorBio, setAuthorBio] = useState(
    "Alexander Meyer is a DeFi expert with over 5 years of experience in blockchain technology and decentralized finance. He has written extensively about cryptocurrency and DeFi protocols."
  )
  const [authorLinksX, setAuthorLinksX] = useState("")
  const [authorLinksLinkedin, setAuthorLinksLinkedin] = useState("")
  const [authorLinksWebsite, setAuthorLinksWebsite] = useState("")

  // Meta fields
  const [metaTitle, setMetaTitle] = useState(
    "Understanding DeFi Lending: A Complete Guide for Beginners"
  )
  const [metaDescription, setMetaDescription] = useState(
    "Learn everything you need to know about DeFi lending, from how it works to the best platforms and strategies for maximizing your returns."
  )
  const [metaKeywords, setMetaKeywords] = useState(
    "DeFi, Lending, Cryptocurrency, Blockchain, Finance, Guide, Tutorial"
  )
  const [canonicalUrl, setCanonicalUrl] = useState(
    "https://peridot.finance/blog/understanding-defi-lending-complete-guide-beginners"
  )
  const [metaRobots, setMetaRobots] = useState("index,follow")

  // Images
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [ogImageUrl, setOgImageUrl] = useState("")

  // Tags & FAQ
  const [tagsInput, setTagsInput] = useState(
    "DeFi, Lending, Cryptocurrency, Blockchain, Finance, Education, Guide"
  )
  const [faq, setFaq] = useState<FAQItem[]>([
    {
      question: "What is DeFi lending?",
      answer:
        "DeFi lending is a decentralized financial service that allows users to lend and borrow cryptocurrencies without traditional financial intermediaries like banks.",
    },
    {
      question: "How do I start lending in DeFi?",
      answer:
        "To start lending, you need a cryptocurrency wallet, some crypto assets to deposit, and an understanding of the risks involved. Then you can deposit your assets into a DeFi lending platform.",
    },
    {
      question: "What are the risks of DeFi lending?",
      answer:
        "The main risks include smart contract vulnerabilities, market volatility, and potential liquidation if you borrow against collateral. Always do your research and start with small amounts.",
    },
  ])
  const [newFaqQuestion, setNewFaqQuestion] = useState("")
  const [newFaqAnswer, setNewFaqAnswer] = useState("")

  // ── Curriculum fetch ───────────────────────────────────────────────────────

  /** Fetch the live curriculum for the current path and update suggestions. */
  const fetchCurriculum = useCallback(async (path: string, keepSelection = false) => {
    setCurriculumLoading(true)
    try {
      const res = await fetch(`/api/blog/insights-curriculum?path=${path}`)
      const data = await res.json()
      const chapters: CurriculumChapter[] = Array.isArray(data.chapters) ? data.chapters : []
      setCurriculumChapters(chapters)

      if (!keepSelection) {
        if (chapters.length > 0) {
          // Default: add to the last chapter
          setChapterMode("existing")
          const last = chapters[chapters.length - 1]
          setSelectedChapterSlug(last.slug)
          setChapterTitle(last.title)
          setChapterOrder(last.order)
          setLessonOrder(last.lessons.length + 1)
        } else {
          // No chapters yet — force new
          setChapterMode("new")
          setSelectedChapterSlug("")
          setChapterTitle("")
          setChapterOrder(1)
          setLessonOrder(1)
        }
      }
    } catch {
      setCurriculumChapters([])
    } finally {
      setCurriculumLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch curriculum whenever insights mode becomes active or path changes
  useEffect(() => {
    if (contentMode === "insights") {
      fetchCurriculum(insightsPath)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentMode, insightsPath])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectExistingChapter = (slug: string) => {
    setSelectedChapterSlug(slug)
    const ch = curriculumChapters.find((c) => c.slug === slug)
    if (ch) {
      setChapterTitle(ch.title)
      setChapterOrder(ch.order)
      setLessonOrder(ch.lessons.length + 1)
    }
  }

  const handleSwitchChapterMode = (mode: "existing" | "new") => {
    setChapterMode(mode)
    if (mode === "new") {
      const nextOrder = curriculumChapters.length > 0
        ? Math.max(...curriculumChapters.map((c) => c.order)) + 1
        : 1
      setChapterTitle("")
      setChapterOrder(nextOrder)
      setSelectedChapterSlug("")
      setLessonOrder(1)
    } else if (curriculumChapters.length > 0) {
      const last = curriculumChapters[curriculumChapters.length - 1]
      setSelectedChapterSlug(last.slug)
      setChapterTitle(last.title)
      setChapterOrder(last.order)
      setLessonOrder(last.lessons.length + 1)
    }
  }

  const loadLibrary = async () => {
    setLoadingLibrary(true)
    try {
      const params = new URLSearchParams({ limit: "300" })
      if (librarySearch.trim()) params.set("q", librarySearch.trim())
      const res = await fetch(`/api/blog/admin-posts?${params}`)
      const data = await res.json()
      if (data.posts) setLibraryPosts(data.posts)
    } catch {
      // Non-critical — library just won't show
    } finally {
      setLoadingLibrary(false)
    }
  }

  const handleToggleLibrary = async () => {
    const next = !showLibrary
    setShowLibrary(next)
    if (next && libraryPosts.length === 0) await loadLibrary()
  }

  /** Load an existing article into the editor for editing. */
  const loadArticleForEditing = async (postSlug: string) => {
    setLoadingEdit(postSlug)
    try {
      const res = await fetch(`/api/blog/${postSlug}`)
      const data = await res.json()
      const p = data?.post
      if (!p) return

      setTitle(p.title ?? "")
      setSlug(p.slug ?? "")
      setExcerpt(p.excerpt ?? "")
      setContent(p.contentMd ?? "")
      setStatus(p.status === "published" ? "published" : "draft")
      setCategory(p.category ?? "")
      setTagsInput(Array.isArray(p.tags) ? p.tags.join(", ") : "")
      setAuthorName(p.authorName ?? "")
      setAuthorUrl(p.authorUrl ?? "")
      setAuthorPictureUrl(p.authorPictureUrl ?? "")
      setAuthorBio(p.authorBio ?? "")
      setAuthorLinksX(p.authorLinksX ?? "")
      setAuthorLinksLinkedin(p.authorLinksLinkedin ?? "")
      setAuthorLinksWebsite(p.authorLinksWebsite ?? "")
      setCoverImageUrl(p.coverImageUrl ?? "")
      setOgImageUrl(p.ogImageUrl ?? "")
      setMetaTitle(p.metaTitle ?? "")
      setMetaDescription(p.metaDescription ?? "")
      setMetaKeywords(Array.isArray(p.metaKeywords) ? p.metaKeywords.join(", ") : "")
      setCanonicalUrl(p.canonicalUrl ?? "")
      setMetaRobots(p.metaRobots ?? "index,follow")
      setFaq(Array.isArray(p.faq) ? p.faq : [])
      const isInsights = !!p.insightsData
      setContentMode(isInsights ? "insights" : "blog")
      setInsightsDraft(p.insightsData ?? null)
      if (isInsights && p.insightsData) {
        // Sections
        setEditableSections(sectionsToEditable(p.insightsData.sections))
        // Interactive blocks
        if (Array.isArray(p.insightsData.interactiveBlocks)) {
          setEditableBlocks(
            p.insightsData.interactiveBlocks.map((pb: any) => ({
              id: Math.random().toString(36).slice(2, 10),
              afterSectionIndex: pb.afterSectionIndex ?? 0,
              block: pb.block ?? pb,
              expanded: false,
            }))
          )
        } else {
          setEditableBlocks([])
        }
      } else {
        setEditableSections([])
        setEditableBlocks([])
      }
      if (isInsights && p.insightsData) {
        const path = p.insightsData.path ?? "starter"
        setInsightsPath(path)
        setChapterTitle(p.insightsData.chapter?.title ?? "")
        setChapterOrder(p.insightsData.chapter?.order ?? 1)
        setLessonOrder(p.insightsData.lesson?.order ?? 1)
        // When editing, treat as "existing" chapter — fetchCurriculum will run via useEffect
        setChapterMode("existing")
        setSelectedChapterSlug(p.insightsData.chapter?.slug ?? "")
      }

      // Scroll to top of the editor
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      setError("Artikel konnte nicht geladen werden.")
    } finally {
      setLoadingEdit(null)
    }
  }

  /** Reset the form for a new article with the given mode. */
  const resetForNew = (mode: "blog" | "insights") => {
    setTitle("")
    setSlug("")
    setExcerpt("")
    setContent("")
    setStatus("draft")
    setCategory("")
    setTagsInput("")
    setAuthorName("Alexander Meyer")
    setAuthorUrl("")
    setAuthorPictureUrl("")
    setAuthorBio("Alexander Meyer is a DeFi expert with over 5 years of experience in blockchain technology and decentralized finance. He has written extensively about cryptocurrency and DeFi protocols.")
    setAuthorLinksX("")
    setAuthorLinksLinkedin("")
    setAuthorLinksWebsite("")
    setCoverImageUrl("")
    setOgImageUrl("")
    setMetaTitle("")
    setMetaDescription("")
    setMetaKeywords("")
    setCanonicalUrl("")
    setMetaRobots("index,follow")
    setFaq([])
    setContentMode(mode)
    setInsightsPath("starter")
    setChapterTitle("")
    setChapterOrder(1)
    setLessonOrder(1)
    setInsightsDraft(null)
    setEditableBlocks([])
    setEditableSections([])
    setCurriculumChapters([])
    setChapterMode("new")
    setSelectedChapterSlug("")
    setCheckpoint(null)
    setCheckpointSlug(null)
    setCanResume(false)
    setProgressSteps([])
    setError(null)
    setSuccess(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(value))
    }
  }

  const addFAQ = () => {
    if (newFaqQuestion.trim() && newFaqAnswer.trim()) {
      setFaq([...faq, { question: newFaqQuestion, answer: newFaqAnswer }])
      setNewFaqQuestion("")
      setNewFaqAnswer("")
    }
  }

  const removeFAQ = (index: number) => {
    setFaq(faq.filter((_, i) => i !== index))
  }

  const handleUploadCoverImage = async () => {
    if (!imageFile) {
      setUploadStatus("Bitte wähle zuerst eine Bilddatei aus.")
      return
    }
    const effectiveSlug = slug || generateSlug(title) || "article"
    const formData = new FormData()
    formData.append("file", imageFile)
    formData.append("slug", effectiveSlug)

    setUploadingImage(true)
    setUploadStatus("Lade Bild zu Firebase hoch …")
    setError(null)

    try {
      const response = await fetch("/api/blog/upload-image", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload fehlgeschlagen.")
      if (data.url) {
        setCoverImageUrl(data.url)
        setOgImageUrl(data.url)
        setUploadStatus("Bild erfolgreich hochgeladen. URL wurde gesetzt.")
        setSuccess(true)
      } else {
        throw new Error("Unerwartete Antwort: Keine URL erhalten.")
      }
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : "Unbekannter Fehler beim Upload.")
    } finally {
      setUploadingImage(false)
    }
  }

  /**
   * Applies the final `complete` event payload to all form fields.
   */
  const applyGenerationResult = (data: any) => {
    const base = data?.base ?? {}
    const article = data?.article ?? {}
    const meta = data?.meta ?? {}
    const faqItems: FAQItem[] = Array.isArray(data?.faq) ? data.faq : []

    if (base.title) setTitle(base.title)
    if (base.slug) setSlug(base.slug)
    if (base.excerpt) setExcerpt(base.excerpt)
    if (base.category) setCategory(base.category)
    if (Array.isArray(base.tags)) setTagsInput(base.tags.join(", "))
    if (Array.isArray(base.keywords)) setMetaKeywords(base.keywords.join(", "))
    if (article.content) setContent(article.content)
    if (meta.metaTitle) setMetaTitle(meta.metaTitle)
    if (meta.metaDescription) setMetaDescription(meta.metaDescription)
    if (meta.canonicalUrl) setCanonicalUrl(meta.canonicalUrl)
    if (meta.metaRobots) setMetaRobots(meta.metaRobots)
    if (faqItems.length > 0) setFaq(faqItems)
    if (data?.coverImageUrl) {
      setCoverImageUrl(data.coverImageUrl)
      setOgImageUrl(data.coverImageUrl)
    }
    if (data?.insightsDraft) {
      setInsightsDraft(data.insightsDraft)
      setEditableSections(sectionsToEditable(data.insightsDraft?.sections))
      const placements: Array<{ afterSectionIndex: number; block: any }> =
        Array.isArray(data.insightsDraft?.interactiveBlocks) ? data.insightsDraft.interactiveBlocks : []
      setEditableBlocks(
        placements.map((p) => ({
          id: Math.random().toString(36).slice(2, 10),
          afterSectionIndex: p.afterSectionIndex,
          block: p.block,
          expanded: false,
        }))
      )
    }
  }

  /**
   * Runs the AI generation via the SSE streaming endpoint.
   * Pass `resume: true` to continue from the last saved checkpoint.
   */
  const handleGenerateStream = async (resume = false) => {
    const titleOrKeyword = title.trim()
    if (!titleOrKeyword) {
      setError("Bitte gib zuerst einen Titel oder ein Keyword ein.")
      return
    }

    setGenerating(true)
    setCanResume(false)
    setError(null)
    setSuccess(false)

    // Build initial progress steps — mark already-completed ones if resuming
    const resumeCheckpoint = resume ? checkpoint : null
    const initialSteps: ProgressStep[] = GENERATION_STEPS.map((s) => ({
      ...s,
      status: resumeCheckpoint?.completedSteps.includes(s.id)
        ? "completed"
        : "pending",
    }))
    setProgressSteps(initialSteps)

    // The checkpoint we accumulate during this run
    let runCheckpoint: GenerationCheckpoint = resumeCheckpoint ?? {
      topicInput: {
        title: titleOrKeyword,
        mode: contentMode,
        ...(contentMode === "insights" ? {
          insightsPath,
          chapterTitle: chapterTitle || undefined,
          chapterOrder,
          lessonOrder,
        } : {}),
      },
      completedSteps: [],
      partialData: {},
      startedAt: new Date().toISOString(),
    }

    // The slug we'll use as checkpoint key (available after base-info completes)
    let currentSlug = resume ? checkpointSlug : null

    try {
      const body: Record<string, any> = {
        title: titleOrKeyword,
        mode: contentMode,
        ...(contentMode === "insights" ? {
          insightsPath,
          chapterTitle: chapterTitle || undefined,
          chapterOrder,
          lessonOrder,
        } : {}),
      }
      if (resumeCheckpoint) {
        body.resumeFrom = {
          completedSteps: resumeCheckpoint.completedSteps,
          partialData: resumeCheckpoint.partialData,
        }
      }

      const response = await fetch("/api/blog/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || "Generierung fehlgeschlagen")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let generationFailed = false

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue

          let event: any
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          const { step, status: evStatus, message, data } = event

          // ── Generation complete ───────────────────────────────────────────
          if (step === "complete" && evStatus === "completed") {
            applyGenerationResult(data)
            // Clear the checkpoint — generation succeeded
            if (currentSlug) saveCheckpoint(currentSlug, null, true)
            setCheckpoint(null)
            setCheckpointSlug(null)
            setProgressSteps([])
            setSuccess(true)
            break outer
          }

          // ── Hard error from server ────────────────────────────────────────
          if (step === "error") {
            setError(message || "Generierung fehlgeschlagen")
            generationFailed = true
            runCheckpoint = { ...runCheckpoint, failedAt: "unknown" }
            break outer
          }

          // ── Per-step progress update ──────────────────────────────────────
          setProgressSteps((prev) =>
            prev.map((s) =>
              s.id === step
                ? { ...s, status: evStatus as StepStatus, message: message ?? s.message }
                : s
            )
          )

          // ── Accumulate checkpoint after each completed step ───────────────
          if (evStatus === "completed" && data) {
            runCheckpoint = {
              ...runCheckpoint,
              completedSteps: [...new Set([...runCheckpoint.completedSteps, step])],
              partialData: { ...runCheckpoint.partialData, [step]: data },
            }
            setCheckpoint(runCheckpoint)

            // After base-info we finally have a slug — start persisting to DB
            if (step === "base-info" && data.slug) {
              currentSlug = data.slug as string
              setCheckpointSlug(currentSlug)
            }
            // Persist checkpoint for every step that has a slug
            if (currentSlug) {
              saveCheckpoint(currentSlug, runCheckpoint, false)
            }
          }

          // Mark a step as failed in the progress list
          if (evStatus === "error") {
            runCheckpoint = { ...runCheckpoint, failedAt: step }
          }
        }
      }

      if (generationFailed) {
        // Offer resume only if we have meaningful checkpoint data
        if (runCheckpoint.completedSteps.length > 0) {
          const lastStep = runCheckpoint.failedAt ?? runCheckpoint.completedSteps.at(-1)
          const stepLabel =
            GENERATION_STEPS.find((s) => s.id === lastStep)?.label ?? lastStep ?? "?"
          setResumeLabel(stepLabel)
          setCanResume(true)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      setError(message)
      // Offer resume if we accumulated any data before the crash
      if (runCheckpoint.completedSteps.length > 0) {
        const lastStep = runCheckpoint.completedSteps.at(-1)
        const stepLabel =
          GENERATION_STEPS.find((s) => s.id === lastStep)?.label ?? lastStep ?? "?"
        setResumeLabel(stepLabel)
        setCheckpoint(runCheckpoint)
        setCanResume(true)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean)
      const keywords = metaKeywords.split(",").map((k) => k.trim()).filter(Boolean)

      const response = await fetch("/api/blog/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug || generateSlug(title),
          title,
          excerpt,
          content,
          status,
          category: category || null,
          tags,
          authorName: authorName || "Alexander Meyer",
          authorUrl: authorUrl || null,
          authorPictureUrl: authorPictureUrl || null,
          authorBio: authorBio || null,
          authorLinksX: authorLinksX || null,
          authorLinksLinkedin: authorLinksLinkedin || null,
          authorLinksWebsite: authorLinksWebsite || null,
          coverImageUrl: coverImageUrl || "/blog/article-title.webp",
          ogImageUrl: ogImageUrl || coverImageUrl || "/blog/article-title.webp",
          metaTitle: metaTitle || title,
          metaDescription: metaDescription || excerpt,
          metaKeywords: keywords,
          canonicalUrl: canonicalUrl || null,
          metaRobots: metaRobots || "index,follow",
          faq: faq.length > 0 ? faq : null,
          insightsData: contentMode === "insights"
            ? (() => {
                // Use editableSections as the authoritative source (user may have edited them)
                const sections = editableSections.map((s) => ({
                  heading: s.heading,
                  sentences: s.sentences.filter(Boolean),
                  callout: s.callout || undefined,
                }))

                // Build merged InsightsBlock[] array: sections → text blocks + interactive blocks interleaved
                const mergedBlocks: any[] = []
                sections.forEach((section, idx) => {
                  mergedBlocks.push({ type: "heading", text: section.heading })
                  section.sentences.forEach((s) => mergedBlocks.push({ type: "paragraph", text: s }))
                  if (section.callout) mergedBlocks.push({ type: "callout", text: section.callout })
                  editableBlocks
                    .filter((eb) => eb.afterSectionIndex === idx)
                    .forEach((eb) => mergedBlocks.push(eb.block))
                })

                // Store interactiveBlocks separately for future editing round-trips
                const storedInteractiveBlocks = editableBlocks.map((eb) => ({
                  afterSectionIndex: eb.afterSectionIndex,
                  block: eb.block,
                }))

                return {
                  ...(insightsDraft ?? {}),
                  path: insightsPath,
                  chapter: chapterTitle
                    ? {
                        slug: chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
                        title: chapterTitle,
                        order: chapterOrder,
                      }
                    : (insightsDraft?.chapter ?? null),
                  lesson: { order: lessonOrder },
                  sections,
                  interactiveBlocks: storedInteractiveBlocks.length > 0 ? storedInteractiveBlocks : undefined,
                  blocks: mergedBlocks.length > 0 ? mergedBlocks : undefined,
                }
              })()
            : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save article")
      }

      setSuccess(true)
      // Clear any leftover checkpoint once the article is saved
      const savedSlug = slug || generateSlug(title)
      if (savedSlug) saveCheckpoint(savedSlug, null, true)

      setTimeout(() => {
        setTitle("")
        setSlug("")
        setExcerpt("")
        setContent("")
        setStatus("draft")
        setCategory("")
        setAuthorName("Alexander Meyer")
        setAuthorUrl("")
        setAuthorPictureUrl("")
        setAuthorBio("Alexander Meyer is a DeFi expert with over 5 years of experience in blockchain technology and decentralized finance. He has written extensively about cryptocurrency and DeFi protocols.")
        setAuthorLinksX("")
        setAuthorLinksLinkedin("")
        setAuthorLinksWebsite("")
        setMetaTitle("")
        setMetaDescription("")
        setMetaKeywords("")
        setCanonicalUrl("")
        setMetaRobots("index,follow")
        setCoverImageUrl("")
        setOgImageUrl("")
        setTagsInput("")
        setFaq([])
        setInsightsDraft(null)
        setChapterTitle("")
        setChapterOrder(1)
        setLessonOrder(1)
        setSuccess(false)
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const blogCount = libraryPosts.filter((p) => !p.hasInsights).length
  const insightsCount = libraryPosts.filter((p) => p.hasInsights).length

  /** Filtered library posts — type filter + path filter + text search */
  const filteredPosts = libraryPosts
    .filter((p) => {
      if (libraryFilter === "blog") return !p.hasInsights
      if (libraryFilter === "insights") return p.hasInsights
      return true
    })
    .filter((p) => {
      if (libraryFilter !== "insights" || libraryPathFilter === "all") return true
      return p.insightsPath === libraryPathFilter
    })
    .filter((p) => {
      if (!librarySearch.trim()) return true
      const q = librarySearch.toLowerCase()
      return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
    })

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-4">

      {/* ── Top action bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Library toggle */}
        <Button variant="outline" size="sm" onClick={handleToggleLibrary} className="gap-2">
          <BookOpen className="h-4 w-4" />
          Article Library
          {libraryPosts.length > 0 && (
            <span className="text-xs bg-muted rounded px-1.5 py-0.5">{libraryPosts.length}</span>
          )}
          {showLibrary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        <div className="flex-1" />

        {/* New article entry points */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetForNew("blog")}
          className="gap-1.5"
        >
          <FileText className="h-4 w-4" />
          New Blog Article
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => resetForNew("insights")}
          className="gap-1.5"
        >
          <Lightbulb className="h-4 w-4" />
          New Insight
        </Button>
      </div>

      {/* ── Article Library panel ──────────────────────────────────────────── */}
      {showLibrary && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Article Library</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadLibrary}
                disabled={loadingLibrary}
                className="h-7 px-2 gap-1 text-muted-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingLibrary ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Type filter tabs */}
            <div className="flex gap-1">
              {(["all", "blog", "insights"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setLibraryFilter(f); setLibraryPathFilter("all") }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    libraryFilter === f
                      ? f === "insights"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                        : f === "blog"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {f === "all" && `All (${libraryPosts.length})`}
                  {f === "blog" && `Blog (${blogCount})`}
                  {f === "insights" && `Insights (${insightsCount})`}
                </button>
              ))}
            </div>

            {/* Path chips — only when Insights tab is active */}
            {libraryFilter === "insights" && (
              <div className="flex gap-1 flex-wrap">
                {(["all", "starter", "yield", "risk", "market"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLibraryPathFilter(p)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors capitalize ${
                      libraryPathFilter === p
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p === "all" ? "All paths" : p}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <Input
              placeholder="Search by title or slug…"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              className="h-8 text-sm"
            />

            {loadingLibrary && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}

            {!loadingLibrary && filteredPosts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No articles found.</p>
            )}

            {!loadingLibrary && filteredPosts.length > 0 && (
              <div className="divide-y max-h-80 overflow-y-auto rounded-md border">
                {filteredPosts.map((post) => (
                  <div key={post.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                    {/* Type badge */}
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${
                        post.hasInsights
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      }`}
                    >
                      {post.hasInsights ? (
                        <><Lightbulb className="h-2.5 w-2.5" />Insight</>
                      ) : (
                        <><FileText className="h-2.5 w-2.5" />Blog</>
                      )}
                    </span>

                    {/* Title + slug + curriculum position */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{post.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs text-muted-foreground truncate">{post.slug}</p>
                        {post.hasInsights && post.insightsPath && (
                          <span className="text-[10px] text-muted-foreground/70 shrink-0">
                            · <span className="capitalize">{post.insightsPath}</span>
                            {post.insightsChapterOrder != null && (
                              <> · Ch.{post.insightsChapterOrder}
                                {post.insightsChapterTitle && ` ${post.insightsChapterTitle}`}
                              </>
                            )}
                            {post.insightsLessonOrder != null && <> · L.{post.insightsLessonOrder}</>}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
                        post.status === "published"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                      }`}
                    >
                      {post.status}
                    </span>

                    {/* Edit button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1 flex-shrink-0"
                      onClick={() => loadArticleForEditing(post.slug)}
                      disabled={loadingEdit === post.slug}
                    >
                      {loadingEdit === post.slug ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Main editor card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>
              {contentMode === "insights" ? "Create New Insight" : "Create New Article"}
            </CardTitle>
            {/* Mode indicator badge */}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${
                contentMode === "insights"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {contentMode === "insights" ? "Insight" : "Blog"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>

              {/* Insights curriculum fields — shown BEFORE title so position is set first */}
              {contentMode === "insights" && (
                <div className="rounded-lg border-2 border-violet-200 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/20 p-4 space-y-4">

                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-violet-500 shrink-0" />
                    <p className="text-sm font-semibold">Where does this lesson fit?</p>
                    {curriculumLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                    )}
                  </div>

                  {/* ── Path ── */}
                  <div>
                    <Label htmlFor="insightsPath">Learning Path</Label>
                    <Select
                      value={insightsPath}
                      onValueChange={(v) =>
                        setInsightsPath(v as "starter" | "yield" | "risk" | "market")
                      }
                    >
                      <SelectTrigger id="insightsPath" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter — DeFi Basics</SelectItem>
                        <SelectItem value="yield">Yield — Earning Strategies</SelectItem>
                        <SelectItem value="risk">Risk — Risk Management</SelectItem>
                        <SelectItem value="market">Market — Market Analysis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ── Chapter — single dropdown; "＋ New chapter" at bottom ── */}
                  {!curriculumLoading && (
                    <div>
                      <Label htmlFor="chapterSelect">Chapter</Label>
                      <Select
                        value={chapterMode === "new" ? "__new__" : selectedChapterSlug}
                        onValueChange={(v) => {
                          if (v === "__new__") handleSwitchChapterMode("new")
                          else handleSelectExistingChapter(v)
                        }}
                      >
                        <SelectTrigger id="chapterSelect" className="mt-1">
                          <SelectValue placeholder={curriculumChapters.length === 0 ? "No chapters yet — create the first one" : "Pick a chapter…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {curriculumChapters.map((ch) => (
                            <SelectItem key={ch.slug} value={ch.slug}>
                              Ch.{ch.order} · {ch.title}
                              <span className="ml-2 text-muted-foreground">
                                ({ch.lessons.length} lesson{ch.lessons.length !== 1 ? "s" : ""})
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__">
                            ＋ New chapter
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* New chapter fields — revealed inline when "＋ New chapter" is chosen */}
                      {chapterMode === "new" && (
                        <div className="mt-3 pl-3 border-l-2 border-violet-300 dark:border-violet-700 grid grid-cols-[1fr_6rem] gap-3">
                          <div>
                            <Label htmlFor="chapterTitle">Chapter title</Label>
                            <Input
                              id="chapterTitle"
                              value={chapterTitle}
                              onChange={(e) => setChapterTitle(e.target.value)}
                              placeholder="e.g. Advanced Borrowing"
                              className="mt-1"
                              autoFocus
                            />
                          </div>
                          <div>
                            <Label htmlFor="chapterOrder">Chapter #</Label>
                            <Input
                              id="chapterOrder"
                              type="number"
                              min={1}
                              max={99}
                              value={chapterOrder}
                              onChange={(e) => setChapterOrder(Math.max(1, parseInt(e.target.value) || 1))}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Lesson # ── */}
                  {!curriculumLoading && (
                    <div className="grid grid-cols-[1fr_6rem] gap-3 items-end">
                      <p className="text-xs text-muted-foreground leading-relaxed pb-1">
                        {chapterMode === "existing" && selectedChapterSlug
                          ? (() => {
                              const ch = curriculumChapters.find((c) => c.slug === selectedChapterSlug)
                              return ch
                                ? `"${ch.title}" has ${ch.lessons.length} lesson${ch.lessons.length !== 1 ? "s" : ""}. This will be lesson ${lessonOrder} of ${ch.lessons.length + 1}.`
                                : "Lesson position within the chapter."
                            })()
                          : chapterMode === "new" && chapterTitle
                          ? `First lesson in the new "${chapterTitle}" chapter.`
                          : "Lesson position within the chapter."
                        }
                      </p>
                      <div>
                        <Label htmlFor="lessonOrder">Lesson #</Label>
                        <Input
                          id="lessonOrder"
                          type="number"
                          min={1}
                          max={99}
                          value={lessonOrder}
                          onChange={(e) => setLessonOrder(Math.max(1, parseInt(e.target.value) || 1))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Position summary pill ── */}
                  {(chapterTitle || selectedChapterSlug) && (
                    <div className="flex items-center gap-1.5 bg-white dark:bg-background rounded-md px-3 py-2 border text-xs font-medium">
                      <span className="text-violet-500">📍</span>
                      <span className="capitalize text-muted-foreground">{insightsPath}</span>
                      <span className="text-muted-foreground">›</span>
                      <span>Ch.{chapterOrder}: {chapterTitle || "…"}</span>
                      <span className="text-muted-foreground">›</span>
                      <span>
                        Lesson {lessonOrder}
                        {chapterMode === "existing" && selectedChapterSlug && (() => {
                          const ch = curriculumChapters.find((c) => c.slug === selectedChapterSlug)
                          return ch ? ` of ${ch.lessons.length + 1}` : ""
                        })()}
                      </span>
                    </div>
                  )}

                  {/* ── Unified Article Structure Editor ── */}
                  <InsightsArticleEditor
                    sections={editableSections}
                    onSectionsChange={setEditableSections}
                    blocks={editableBlocks}
                    onBlocksChange={setEditableBlocks}
                    articleTitle={title}
                    articleExcerpt={excerpt}
                    articlePath={insightsPath}
                    articleSummary={insightsDraft?.summary ?? excerpt}
                    articlePrimaryKeyword={insightsDraft?.primaryKeyword}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter article title"
                  required
                />
              </div>

              {/* AI Generation controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleGenerateStream(false)}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generiere …
                      </>
                    ) : (
                      "Mit KI generieren"
                    )}
                  </Button>

                  {/* Resume button — shown only after a partial failure */}
                  {canResume && !generating && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleGenerateStream(true)}
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Weiter ab &quot;{resumeLabel}&quot;
                    </Button>
                  )}
                </div>

                {/* Step-by-step progress */}
                <GenerationProgress steps={progressSteps} />

                {/* Resume banner — persists between page interactions */}
                {canResume && !generating && checkpoint && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-300">
                        Generierung unterbrochen
                      </p>
                      <p className="text-amber-700 dark:text-amber-400">
                        {checkpoint.completedSteps.length} von {GENERATION_STEPS.length} Schritte
                        abgeschlossen. Klicke &quot;Weiter ab &quot;{resumeLabel}&quot;&quot; um
                        ab dem letzten erfolgreichen Schritt fortzufahren.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="article-url-slug"
                  required
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt *</Label>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Brief description of the article"
                  rows={3}
                  required
                />
              </div>

              <div>
                <Label htmlFor="content">Content (Markdown) *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"# Article Title\n\nYour article content in Markdown format..."}
                  rows={20}
                  className="font-mono text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v: "draft" | "published") => setStatus(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Education, News, etc."
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="DeFi, Lending, Cross-Chain"
                />
              </div>
            </div>

            {/* Author Information */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold">Author Information</h3>

              <div>
                <Label htmlFor="authorName">Author Name</Label>
                <Input
                  id="authorName"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Placeholder Author"
                />
              </div>

              <div>
                <Label htmlFor="authorUrl">Author URL</Label>
                <Input
                  id="authorUrl"
                  value={authorUrl}
                  onChange={(e) => setAuthorUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/author"
                />
              </div>

              <div>
                <Label htmlFor="authorPictureUrl">Author Picture URL</Label>
                <Input
                  id="authorPictureUrl"
                  value={authorPictureUrl}
                  onChange={(e) => setAuthorPictureUrl(e.target.value)}
                  placeholder="/blog/author-picture.webp"
                />
              </div>

              <div>
                <Label htmlFor="authorBio">Author Bio</Label>
                <Textarea
                  id="authorBio"
                  value={authorBio}
                  onChange={(e) => setAuthorBio(e.target.value)}
                  placeholder="Author biography..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="authorLinksX">X (Twitter)</Label>
                  <Input
                    id="authorLinksX"
                    value={authorLinksX}
                    onChange={(e) => setAuthorLinksX(e.target.value)}
                    placeholder="@username"
                  />
                </div>

                <div>
                  <Label htmlFor="authorLinksLinkedin">LinkedIn</Label>
                  <Input
                    id="authorLinksLinkedin"
                    value={authorLinksLinkedin}
                    onChange={(e) => setAuthorLinksLinkedin(e.target.value)}
                    placeholder="linkedin.com/in/author"
                  />
                </div>

                <div>
                  <Label htmlFor="authorLinksWebsite">Website</Label>
                  <Input
                    id="authorLinksWebsite"
                    value={authorLinksWebsite}
                    onChange={(e) => setAuthorLinksWebsite(e.target.value)}
                    placeholder="https://author.com"
                  />
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold">Images</h3>

              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  <strong>Automatic Cover Image Generation:</strong> If no cover image is provided,
                  a green gradient image with white title text will be automatically generated and
                  uploaded to Firebase Storage.
                </p>
              </div>

              <div>
                <Label htmlFor="coverImageUrl">
                  Cover Image URL (optional — auto-generated if empty)
                </Label>
                <Input
                  id="coverImageUrl"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="Leave empty for auto-generation"
                />
              </div>

              <div>
                <Label htmlFor="ogImageUrl">
                  OG Image URL (optional — defaults to cover image)
                </Label>
                <Input
                  id="ogImageUrl"
                  value={ogImageUrl}
                  onChange={(e) => setOgImageUrl(e.target.value)}
                  placeholder="Leave empty to use cover image"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverImageUpload">Upload eigenes Titelbild (optional)</Label>
                <Input
                  id="coverImageUpload"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    setImageFile(file)
                    setUploadStatus(file ? `${file.name} ausgewählt` : null)
                  }}
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUploadCoverImage}
                    disabled={uploadingImage || !imageFile}
                  >
                    {uploadingImage ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Lade hoch …
                      </>
                    ) : (
                      "Bild zu Firebase hochladen"
                    )}
                  </Button>
                  {uploadStatus && (
                    <p className="text-sm text-muted-foreground">{uploadStatus}</p>
                  )}
                </div>
              </div>
            </div>

            {/* SEO Meta */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold">SEO Meta Information</h3>

              <div>
                <Label htmlFor="metaTitle">Meta Title</Label>
                <Input
                  id="metaTitle"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={title || "Article Title"}
                />
              </div>

              <div>
                <Label htmlFor="metaDescription">Meta Description</Label>
                <Textarea
                  id="metaDescription"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={excerpt || "Article description"}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="metaKeywords">Meta Keywords (comma-separated)</Label>
                <Input
                  id="metaKeywords"
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="canonicalUrl">Canonical URL</Label>
                  <Input
                    id="canonicalUrl"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                    placeholder="https://peridot.finance/blog/article-slug"
                  />
                </div>

                <div>
                  <Label htmlFor="metaRobots">Meta Robots</Label>
                  <Input
                    id="metaRobots"
                    value={metaRobots}
                    onChange={(e) => setMetaRobots(e.target.value)}
                    placeholder="index,follow"
                  />
                </div>
              </div>
            </div>

            {/* FAQ */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold">FAQ</h3>

              {faq.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="font-medium">{item.question}</p>
                      <p className="text-sm text-muted-foreground mt-1">{item.answer}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFAQ(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}

              <div className="space-y-2">
                <Input
                  value={newFaqQuestion}
                  onChange={(e) => setNewFaqQuestion(e.target.value)}
                  placeholder="FAQ Question"
                />
                <Textarea
                  value={newFaqAnswer}
                  onChange={(e) => setNewFaqAnswer(e.target.value)}
                  placeholder="FAQ Answer"
                  rows={2}
                />
                <Button type="button" variant="outline" onClick={addFAQ} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add FAQ Item
                </Button>
              </div>
            </div>

            {/* Error / Success messages */}
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500 rounded-md">
                <p className="text-green-600">Article saved successfully!</p>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Article
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
