"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import {
  Plus,
  X,
  Save,
  Loader2,
  Sparkles,
  FileText,
  ShieldCheck,
  ClipboardCheck,
  Gauge,
  Search,
  RefreshCw,
  Pencil,
  History,
  BookOpen,
} from "lucide-react"
import { GenerationProgressDialog, type GenerationStep, type StepStatus } from "@/components/blog/generation-progress-dialog"

interface FAQItem {
  question: string
  answer: string
}

type InteractiveBlockSpec =
  | { type: "calculator"; variant: "health-factor" | "apy-vs-apr" | "yield-return"; label?: string }
  | { type: "predict"; prompt: string; options: string[]; correctIndex: number; reveal: string }
  | { type: "checkpoint"; question: string; options: Array<{ text: string; correct: boolean; explanation: string }> }
  | { type: "jenga"; loanAmount?: number; liqLtv?: number; initialBlocks?: number }
  | { type: "vault-builder"; initialCoins?: Array<"eth" | "btc" | "usdc">; targetCollateral?: number }
  | { type: "borrowing-power"; assets?: Array<"eth" | "btc" | "usdc"> }
  | { type: "leverage-seesaw"; maxLeverage?: number }
  | { type: "rate-highway"; kinkUtilization?: number }
  | { type: "liquidation-dominoes" }
  | { type: "apy-snowball"; rate?: number; months?: number }
  | { type: "position-builder" }

interface InteractiveBlockPlacement {
  afterSectionIndex: number
  block: InteractiveBlockSpec
}

type InsightsPath = "starter" | "yield" | "risk" | "market" | "action"
type FunnelStage = "awareness" | "consideration" | "conversion"

interface InsightsSectionDraft {
  id: string
  heading: string
  sentences: string[]
  callout: string
  imageUrl?: string
  imageAlt?: string
  imagePlacement?: string
}

interface GeneratedInsightsDraft {
  path: InsightsPath
  sections: Array<{
    heading: string
    sentences: string[]
    callout: string
    imageUrl?: string
    imageAlt?: string
    imagePlacement?: string
  }>
}

interface ParsedInsightsMarkdown {
  title?: string
  excerpt?: string
  path?: InsightsPath
  warnings?: string[]
  sections: Array<{
    heading: string
    sentences: string[]
    callout: string
    imageUrl?: string
    imageAlt?: string
    imagePlacement?: string
  }>
}

interface CurriculumLesson {
  slug: string
  title: string
  lessonOrder: number
  status: "draft" | "published"
}

interface CurriculumChapter {
  slug: string
  title: string
  order: number
  lessons: CurriculumLesson[]
}

const MAX_SECTION_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED_SECTION_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])
const ALLOWED_COVER_IMAGE_TYPES = new Set([...ALLOWED_SECTION_IMAGE_TYPES, "image/svg+xml"])

// Hosts next/image is allowed to render (next.config.js remotePatterns). A cover
// URL from anywhere else has to be re-hosted on R2 first, or it renders broken.
const SELF_HOSTED_IMAGE_HOSTS = [".r2.dev", "cdn.peridot.finance", ".peridot.finance", "peridot.finance"]

function isSelfHostedImageUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.startsWith("/")) return true
  try {
    const host = new URL(trimmed).host.toLowerCase()
    return SELF_HOSTED_IMAGE_HOSTS.some((allowed) =>
      allowed.startsWith(".") ? host.endsWith(allowed) : host === allowed
    )
  } catch {
    return false
  }
}

interface RelevanceBreakdown {
  defiRelevance: number
  peridotAlignment: number
  educationalValue: number
  marketDemand: number
  contentGap: number
  [key: string]: number
}

interface TopicPlan {
  validation?: {
    isRelevant: boolean
    relevanceScore: number
    relevanceBreakdown?: RelevanceBreakdown
    recommendedTopics?: string[]
    rejectionReason?: string | null
  }
  direction?: {
    recommendedAngle?: string
    angleRationale?: string
    primaryAngle?: {
      type: string
      description: string
      targetAudience: string
      uniqueValue: string
      peridotConnection: string
      confidence: number
    }
  }
  objectives?: {
    userIntent?: string
    contentObjectives?: {
      educateOn?: string[]
      answerQuestions?: string[]
      provideExamples?: string[]
      includeActionableSteps?: boolean
    }
    businessObjectives?: {
      driveTraffic?: boolean
      buildAuthority?: boolean
      promotePeridot?: boolean
      generateLeads?: boolean
    }
    userObjectives?: {
      knowledgeLevel?: string
      takeawayValue?: string
      actionItems?: string[]
    }
  }
  recommendations?: string[]
  proceedWithGeneration?: boolean
}

type ArticleStatus = "draft" | "published"
type ArticleTypeFilter = "all" | "blog" | "insights"
type ArticleLibraryFilter = "all" | ArticleStatus

interface AdminPostSummary {
  id: number
  slug: string
  title: string
  excerpt?: string | null
  status: ArticleStatus
  category?: string | null
  hasInsights?: boolean
  insightsPath?: string | null
  insightsChapterTitle?: string | null
  insightsChapterOrder?: number | null
  insightsLessonOrder?: number | null
  publishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface AdminPostDetail extends AdminPostSummary {
  contentMd: string
  wordCount?: number | null
  readingTimeMinutes?: number | null
  authorName?: string | null
  authorUrl?: string | null
  authorPictureUrl?: string | null
  authorBio?: string | null
  authorLinksX?: string | null
  authorLinksLinkedin?: string | null
  authorLinksWebsite?: string | null
  faq?: FAQItem[] | null
  insightsData?: {
    path: InsightsPath
    sections: InsightsSectionDraft[]
    funnelStage?: FunnelStage
    peridotCta?: string
    ctaLabel?: string
    peridotRelevance?: "high" | "medium" | "low" | "none"
    actionArticleSuggestion?: { title: string; slug: string } | null
    chapter?: { slug: string; title: string; order: number }
    lesson?: { order: number }
    blocks?: any[]
    interactiveBlocks?: InteractiveBlockPlacement[]
  } | null
  tags?: string[] | null
  coverImageUrl?: string | null
  ogImageUrl?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  metaKeywords?: string[] | null
  canonicalUrl?: string | null
  metaRobots?: string | null
}

interface CreateArticleRequestBody {
  slug: string
  title: string
  excerpt: string
  content: string
  status: ArticleStatus
  category: string | null
  tags: string[]
  authorName: string
  authorUrl: string | null
  authorPictureUrl: string | null
  authorBio: string | null
  authorLinksX: string | null
  authorLinksLinkedin: string | null
  authorLinksWebsite: string | null
  coverImageUrl: string
  ogImageUrl: string
  metaTitle: string
  metaDescription: string
  metaKeywords: string[]
  canonicalUrl: string | null
  metaRobots: string
  faq: FAQItem[] | null
  insightsData: {
    path: InsightsPath
    sections: InsightsSectionDraft[]
    funnelStage?: FunnelStage
    peridotCta?: string
    ctaLabel?: string
    peridotRelevance?: "high" | "medium" | "low" | "none"
    actionArticleSuggestion?: { title: string; slug: string } | null
    chapter?: { slug: string; title: string; order: number }
    lesson?: { order: number }
    blocks?: any[]
    interactiveBlocks?: InteractiveBlockPlacement[]
  } | null
}

interface ArticleVersion extends AdminPostDetail {
  createdAt: string
}

const DEFAULT_INSIGHTS_SECTIONS: InsightsSectionDraft[] = [
  {
    id: "sec-1",
    heading: "Mission setup: your first 15 minutes",
    sentences: [
      "Start with a clean wallet setup and a tiny test amount.",
      "Define your risk limit before any transaction.",
    ],
    callout: "Process first. Size second.",
    imageUrl: "",
    imageAlt: "",
    imagePlacement: "after-heading",
  },
  {
    id: "sec-2",
    heading: "Checklist before touching any protocol",
    sentences: [
      "Confirm network, token, and route details.",
      "Set slippage and verify estimated output.",
    ],
    callout: "Avoid hidden mistakes by checking once more.",
    imageUrl: "",
    imageAlt: "",
    imagePlacement: "after-heading",
  },
  {
    id: "sec-3",
    heading: "Execution phase: one controlled transaction",
    sentences: [
      "Run one small transaction and verify result details.",
      "Pause if outcomes differ from your expectation.",
    ],
    callout: "Repeat only after reviewing what happened.",
    imageUrl: "",
    imageAlt: "",
    imagePlacement: "after-heading",
  },
]

export default function CreateArticlePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState("Article saved successfully.")
  const [generating, setGenerating] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [importingCoverUrl, setImportingCoverUrl] = useState(false)
  const [libraryPosts, setLibraryPosts] = useState<AdminPostSummary[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryFilter, setLibraryFilter] = useState<ArticleLibraryFilter>("all")
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<ArticleTypeFilter>("all")
  const [libraryPathFilter, setLibraryPathFilter] = useState<string>("all")
  const [activeArticleSlug, setActiveArticleSlug] = useState<string | null>(null)
  const [activeArticleUpdatedAt, setActiveArticleUpdatedAt] = useState<string | null>(null)
  const [articleLoadingSlug, setArticleLoadingSlug] = useState<string | null>(null)
  const [statusUpdatingSlug, setStatusUpdatingSlug] = useState<string | null>(null)
  const [baseEditorSnapshot, setBaseEditorSnapshot] = useState<string | null>(null)
  const [versions, setVersions] = useState<ArticleVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  
  // Basic fields
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState<ArticleStatus>("draft")
  const [category, setCategory] = useState("Education")
  
  // Author fields
  const [authorName, setAuthorName] = useState("Peridot.Finance")
  const [authorUrl, setAuthorUrl] = useState("")
  const [authorPictureUrl, setAuthorPictureUrl] = useState("")
  const [authorBio, setAuthorBio] = useState("")
  const [authorLinksX, setAuthorLinksX] = useState("")
  const [authorLinksLinkedin, setAuthorLinksLinkedin] = useState("")
  const [authorLinksWebsite, setAuthorLinksWebsite] = useState("")
  
  // Meta fields
  const [metaTitle, setMetaTitle] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [metaKeywords, setMetaKeywords] = useState("")
  const [canonicalUrl, setCanonicalUrl] = useState("")
  const [metaRobots, setMetaRobots] = useState("index,follow")
  
  // Images
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [ogImageUrl, setOgImageUrl] = useState("")
  
  // Tags
  const [tagsInput, setTagsInput] = useState("")
  
  // FAQ
  const [faq, setFaq] = useState<FAQItem[]>([])
  const [newFaqQuestion, setNewFaqQuestion] = useState("")
  const [newFaqAnswer, setNewFaqAnswer] = useState("")
  const [topicPlan, setTopicPlan] = useState<TopicPlan | null>(null)
  const [claimCriticisms, setClaimCriticisms] = useState<Record<number, string>>({})
  const [claimEnhanced, setClaimEnhanced] = useState<Record<number, string>>({})
  const [loadingCriticism, setLoadingCriticism] = useState<Record<number, boolean>>({})
  const [loadingEnhance, setLoadingEnhance] = useState<Record<number, boolean>>({})
  
  const [factCheck, setFactCheck] = useState<{
    totalClaims: number
    verified: number
    unverified: number
    needsReview: number
    results: Array<{
      claim: string
      verified: boolean
      confidence: number
      sources?: string[]
      notes?: string
      needsReview: boolean
    }>
    overallStatus: 'pass' | 'warning' | 'fail'
  } | null>(null)
  const [showProgressDialog, setShowProgressDialog] = useState(false)
  const [progressSteps, setProgressSteps] = useState<StepStatus[]>([])
  const [currentProgressStep, setCurrentProgressStep] = useState<GenerationStep | undefined>()
  const [contentComposerTab, setContentComposerTab] = useState<"markdown" | "insights">("markdown")
  // Persistent article-type flag — decoupled from which tab is visible.
  // Set to true when the user switches to the insights tab or loads an insights article.
  // Never cleared automatically by tab navigation; only reset on "New Article".
  const [isInsightsArticle, setIsInsightsArticle] = useState(false)
  const [editorSectionTab, setEditorSectionTab] = useState<"basic" | "content" | "author" | "images" | "seo" | "faq" | "history">("basic")

  const [insightsPath, setInsightsPath] = useState<InsightsPath>("starter")
  const [sectionGenerating, setSectionGenerating] = useState<Record<string, boolean>>({})
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [adminApiPassword, setAdminApiPassword] = useState("")
  const [insightsSections, setInsightsSections] = useState<InsightsSectionDraft[]>(DEFAULT_INSIGHTS_SECTIONS)
  const [activeInsightsSectionId, setActiveInsightsSectionId] = useState("sec-1")
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null)
  const [insightsMarkdownInput, setInsightsMarkdownInput] = useState("")
  const [isEditingInsightsMarkdown, setIsEditingInsightsMarkdown] = useState(false)
  const [insightsMarkdownStatus, setInsightsMarkdownStatus] = useState<string | null>(null)
  const [sectionImageFiles, setSectionImageFiles] = useState<Record<string, File | null>>({})
  const [sectionImageUploading, setSectionImageUploading] = useState<Record<string, boolean>>({})
  const [sectionImageStatus, setSectionImageStatus] = useState<Record<string, string>>({})

  // Interactive blocks (Insights only)
  const [interactiveBlocks, setInteractiveBlocks] = useState<InteractiveBlockPlacement[]>([])
  const [suggestingBlocks, setSuggestingBlocks] = useState(false)
  const [suggestBlocksError, setSuggestBlocksError] = useState<string | null>(null)

  // Funnel stage + CTA (applies to all articles, drives AI content tone)
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("awareness")
  const [peridotCta, setPeridotCta] = useState("")
  const [peridotRelevance, setPeridotRelevance] = useState<"high" | "medium" | "low" | "none">("none")
  const [actionSuggestionTitle, setActionSuggestionTitle] = useState("")
  const [actionSuggestionSlug, setActionSuggestionSlug] = useState("")

  // Curriculum position (Insights only)
  const [chapterSlug, setChapterSlug] = useState("")
  const [chapterTitle, setChapterTitle] = useState("")
  const [chapterOrder, setChapterOrder] = useState(1)
  const [lessonOrder, setLessonOrder] = useState(1)
  const [curriculumChapters, setCurriculumChapters] = useState<CurriculumChapter[]>([])
  const [curriculumLoading, setCurriculumLoading] = useState(false)

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return "n/a"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "n/a"
    return parsed.toLocaleString()
  }

  const cloneDefaultInsightsSections = () =>
    DEFAULT_INSIGHTS_SECTIONS.map((section) => ({
      ...section,
      sentences: [...section.sentences],
    }))

  const normalizeFaqItems = (value: unknown): FAQItem[] => {
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is FAQItem => {
        if (!item || typeof item !== "object") return false
        const candidate = item as FAQItem
        return typeof candidate.question === "string" && typeof candidate.answer === "string"
      })
      .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
      .filter((item) => item.question && item.answer)
  }

  const normalizeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  const getAdminHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (adminApiPassword.trim()) {
      headers["x-admin-password"] = adminApiPassword.trim()
    }
    return headers
  }

  const fetchCurriculum = useCallback(async (path: InsightsPath) => {
    setCurriculumLoading(true)
    try {
      const headers: Record<string, string> = {}
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()
      const response = await fetch(`/api/blog/insights-curriculum?path=${path}`, { headers })
      const data = await response.json()
      if (response.ok) setCurriculumChapters(data.chapters || [])
    } catch (err) {
      console.error("Failed to fetch curriculum:", err)
    } finally {
      setCurriculumLoading(false)
    }
  }, [adminApiPassword])

  useEffect(() => {
    if (contentComposerTab === "insights") void fetchCurriculum(insightsPath)
  }, [contentComposerTab, insightsPath, fetchCurriculum])

  const handleChapterSelect = (value: string) => {
    if (value === "__new__") {
      setChapterSlug("")
      setChapterTitle("")
      const maxOrder = curriculumChapters.reduce((max, ch) => Math.max(max, ch.order), 0)
      setChapterOrder(maxOrder + 1)
      setLessonOrder(1)
    } else {
      const found = curriculumChapters.find((ch) => ch.slug === value)
      if (found) {
        setChapterSlug(found.slug)
        setChapterTitle(found.title)
        setChapterOrder(found.order)
        const maxLesson = found.lessons.reduce((max, l) => Math.max(max, l.lessonOrder), 0)
        setLessonOrder(maxLesson + 1)
      }
    }
  }

  const buildCreatePayload = (effectiveContent: string): CreateArticleRequestBody => ({
    slug: slug || generateSlug(title),
    title,
    excerpt,
    content: effectiveContent,
    status,
    category: category || null,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    authorName: authorName || "Placeholder Author",
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
    metaKeywords: metaKeywords.split(",").map((k) => k.trim()).filter(Boolean),
    canonicalUrl: canonicalUrl || null,
    metaRobots: metaRobots || "index,follow",
    faq: faq.length > 0 ? faq : null,
    insightsData: isInsightsArticle ? {
      path: insightsPath,
      sections: insightsSections,
      funnelStage,
      ...(peridotCta.trim() ? { peridotCta: peridotCta.trim(), ctaLabel: peridotCta.trim(), ctaHref: "/app" } : {}),
      peridotRelevance,
      ...(actionSuggestionTitle.trim() && actionSuggestionSlug.trim()
        ? { actionArticleSuggestion: { title: actionSuggestionTitle.trim(), slug: actionSuggestionSlug.trim() } }
        : { actionArticleSuggestion: null }),
      ...(chapterTitle.trim() ? {
        chapter: {
          slug: chapterSlug || generateSlug(chapterTitle),
          title: chapterTitle.trim(),
          order: chapterOrder,
        },
        lesson: { order: lessonOrder },
      } : {}),
      blocks: mergeBlocksForSave(),
      ...(interactiveBlocks.length > 0 ? { interactiveBlocks } : {}),
    } : null,
  })

  const serializePayload = (payload: CreateArticleRequestBody) => JSON.stringify(payload)

  const resetEditorForNewArticle = () => {
    setTitle("")
    setSlug("")
    setExcerpt("")
    setContent("")
    setStatus("draft")
    setCategory("Education")
    setAuthorName("Alexander Meyer")
    setAuthorUrl("")
    setAuthorPictureUrl("")
    setAuthorBio("")
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
    setContentComposerTab("markdown")
    setIsInsightsArticle(false)
    setInsightsPath("starter")
    setInsightsSections(cloneDefaultInsightsSections())
    setActiveInsightsSectionId("sec-1")
    setInsightsMarkdownInput("")
    setIsEditingInsightsMarkdown(false)
    setFunnelStage("awareness")
    setPeridotCta("")
    setPeridotRelevance("none")
    setActionSuggestionTitle("")
    setActionSuggestionSlug("")
    setChapterSlug("")
    setChapterTitle("")
    setChapterOrder(1)
    setLessonOrder(1)
    setCurriculumChapters([])
    setInteractiveBlocks([])
    setSuggestBlocksError(null)
    setTopicPlan(null)
    setFactCheck(null)
    setClaimCriticisms({})
    setClaimEnhanced({})
    setError(null)
    setSuccess(false)
    setSuccessMessage("Article saved successfully.")
    setActiveArticleSlug(null)
    setActiveArticleUpdatedAt(null)
    setBaseEditorSnapshot(null)
    setEditorSectionTab("basic")
  }

  const fetchVersions = async (targetSlug: string) => {
    setVersionsLoading(true)
    try {
      const response = await fetch(`/api/blog/${encodeURIComponent(targetSlug)}/versions`)
      const data = await response.json()
      if (response.ok) {
        setVersions(data.versions || [])
      }
    } catch (err) {
      console.error("Failed to fetch versions:", err)
    } finally {
      setVersionsLoading(false)
    }
  }

  const applyPostToEditor = (post: any) => {
    setIsRestoring(true)
    console.log("Applying post to editor:", post)
    
    // Fallback for case sensitivity issues from database
    const getVal = (key: string, lowercaseKey: string) => post[key] ?? post[lowercaseKey]
    
    const contentMd = getVal("contentMd", "contentmd") || ""
    const insightsData = getVal("insightsData", "insightsdata")
    const tags = post.tags || []
    const metaKeywordsVal = getVal("metaKeywords", "metakeywords")
    const faqVal = post.faq

    const normalizedTags = normalizeStringArray(tags)
    const normalizedMetaKeywords = normalizeStringArray(metaKeywordsVal)
    const normalizedFaq = normalizeFaqItems(faqVal)

    setTitle(post.title || "")
    setSlug(post.slug || "")
    setExcerpt(post.excerpt || "")
    setContent(contentMd)
    setStatus(post.status === "published" ? "published" : "draft")
    setCategory(post.category || "")
    setAuthorName(getVal("authorName", "authorname") || "Peridot.Finance")
    setAuthorUrl(getVal("authorUrl", "authorurl") || "")
    setAuthorPictureUrl(getVal("authorPictureUrl", "authorpictureurl") || "")
    setAuthorBio(getVal("authorBio", "authorbio") || "")
    setAuthorLinksX(getVal("authorLinksX", "authorlinksx") || "")
    setAuthorLinksLinkedin(getVal("authorLinksLinkedin", "authorlinkslinkedin") || "")
    setAuthorLinksWebsite(getVal("authorLinksWebsite", "authorlinkswebsite") || "")
    setMetaTitle(getVal("metaTitle", "metatitle") || post.title || "")
    setMetaDescription(getVal("metaDescription", "metadescription") || post.excerpt || "")
    setMetaKeywords(normalizedMetaKeywords.join(", "))
    setCanonicalUrl(getVal("canonicalUrl", "canonicalurl") || "")
    setMetaRobots(getVal("metaRobots", "metarobots") || "index,follow")
    setCoverImageUrl(getVal("coverImageUrl", "coverimageurl") || "")
    setOgImageUrl(getVal("ogImageUrl", "ogimageurl") || getVal("coverImageUrl", "coverimageurl") || "")
    setTagsInput(normalizedTags.join(", "))
    setFaq(normalizedFaq)
    
    // Restore Insights data if available, otherwise try to parse from markdown
    if (insightsData) {
      console.log("Restoring insightsData")
      setInsightsPath(insightsData.path || "starter")
      setInsightsSections(insightsData.sections || cloneDefaultInsightsSections())
      setContentComposerTab("insights")
      setIsInsightsArticle(true)
      setFunnelStage(insightsData.funnelStage || "awareness")
      setPeridotCta(insightsData.ctaLabel || insightsData.peridotCta || "")
      setPeridotRelevance(insightsData.peridotRelevance || "none")
      setActionSuggestionTitle(insightsData.actionArticleSuggestion?.title || "")
      setActionSuggestionSlug(insightsData.actionArticleSuggestion?.slug || "")
      if (insightsData.chapter) {
        setChapterSlug(insightsData.chapter.slug || "")
        setChapterTitle(insightsData.chapter.title || "")
        setChapterOrder(insightsData.chapter.order || 1)
      } else {
        setChapterSlug("")
        setChapterTitle("")
        setChapterOrder(1)
      }
      setLessonOrder(insightsData.lesson?.order || 1)
      setInteractiveBlocks(Array.isArray(insightsData.interactiveBlocks) ? insightsData.interactiveBlocks : [])
    } else if (contentMd && contentMd.includes("## ")) {
      console.log("No insightsData, but contentMd has sections. Attempting parse...")
      const parsed = parseInsightsMarkdown(contentMd)
      if (parsed && parsed.sections.length > 0) {
        console.log("Parsed sections successfully:", parsed.sections.length)
        const nextSections = parsed.sections.map((section, idx) => ({
          id: `restored-sec-${idx + 1}-${Date.now()}`,
          heading: section.heading,
          sentences: section.sentences.length ? section.sentences : [""],
          callout: section.callout,
          imageUrl: section.imageUrl || "",
          imageAlt: section.imageAlt || "",
          imagePlacement: normalizeImagePlacement(section.imagePlacement),
        }))
        setInsightsSections(nextSections)
        if (parsed.path) setInsightsPath(parsed.path)
        setContentComposerTab("insights")
        setIsInsightsArticle(true)
      } else {
        console.log("Parsing failed or no sections found.")
        setContentComposerTab("markdown")
        setIsInsightsArticle(false)
        setInteractiveBlocks([])
      }
    } else {
      console.log("Standard markdown article.")
      setInteractiveBlocks([])
      setContentComposerTab("markdown")
      setIsInsightsArticle(false)
    }

    setTopicPlan(null)
    setFactCheck(null)
    setClaimCriticisms({})
    setClaimEnhanced({})
    setSuccess(false)
    setError(null)
    setActiveArticleSlug(post.slug)
    setActiveArticleUpdatedAt(post.updatedAt || null)

    const payload: CreateArticleRequestBody = {
      slug: post.slug || "",
      title: post.title || "",
      excerpt: post.excerpt || "",
      content: post.contentMd || "",
      status: post.status === "published" ? "published" : "draft",
      category: post.category || null,
      tags: normalizedTags,
      authorName: post.authorName || "Placeholder Author",
      authorUrl: post.authorUrl || null,
      authorPictureUrl: post.authorPictureUrl || null,
      authorBio: post.authorBio || null,
      authorLinksX: post.authorLinksX || null,
      authorLinksLinkedin: post.authorLinksLinkedin || null,
      authorLinksWebsite: post.authorLinksWebsite || null,
      coverImageUrl: post.coverImageUrl || "/blog/article-title.webp",
      ogImageUrl: post.ogImageUrl || post.coverImageUrl || "/blog/article-title.webp",
      metaTitle: post.metaTitle || post.title || "",
      metaDescription: post.metaDescription || post.excerpt || "",
      metaKeywords: normalizedMetaKeywords,
      canonicalUrl: post.canonicalUrl || null,
      metaRobots: post.metaRobots || "index,follow",
      faq: normalizedFaq.length > 0 ? normalizedFaq : null,
      insightsData: post.insightsData || null
    }
    setBaseEditorSnapshot(serializePayload(payload))
    void fetchVersions(post.slug)
    
    // Use setTimeout to ensure state updates have propagated before allowing sync
    setTimeout(() => setIsRestoring(false), 100)
  }

  const fetchLibraryPosts = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const response = await fetch("/api/blog/admin-posts?limit=300")
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to load articles.")
      }
      setLibraryPosts(Array.isArray(data.posts) ? data.posts : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load articles."
      setLibraryError(message)
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLibraryPosts()
  }, [fetchLibraryPosts])

  const loadArticleForEditing = async (targetSlug: string) => {
    console.log("Loading article for editing:", targetSlug)
    setArticleLoadingSlug(targetSlug)
    setSuccess(false)
    setError(null)
    try {
      const response = await fetch(`/api/blog/${encodeURIComponent(targetSlug)}`)
      const data = await response.json()
      console.log("Article data received:", data)
      if (!response.ok) {
        throw new Error(data.error || "Failed to load article.")
      }
      applyPostToEditor(data.post as AdminPostDetail)
      setSuccess(true)
      setSuccessMessage(`Loaded "${data.post?.title || targetSlug}" for editing.`)
      setEditorSectionTab("content")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load article."
      setError(message)
    } finally {
      setArticleLoadingSlug(null)
    }
  }

  const saveArticle = async (payload: CreateArticleRequestBody) => {
    const response = await fetch("/api/blog/create", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || "Failed to save article")
    }
    return data
  }

  const toggleArticleStatus = async (post: AdminPostSummary, nextStatus: ArticleStatus) => {
    setStatusUpdatingSlug(post.slug)
    setError(null)
    setSuccess(false)
    try {
      const detailsResponse = await fetch(`/api/blog/${encodeURIComponent(post.slug)}`)
      const detailsJson = await detailsResponse.json()
      if (!detailsResponse.ok) {
        throw new Error(detailsJson.error || "Failed to load article details for status update.")
      }

      const details = detailsJson.post as AdminPostDetail
      const payload: CreateArticleRequestBody = {
        slug: details.slug,
        title: details.title || "",
        excerpt: details.excerpt || "",
        content: details.contentMd || "",
        status: nextStatus,
        category: details.category || null,
        tags: normalizeStringArray(details.tags),
        authorName: details.authorName || "Placeholder Author",
        authorUrl: details.authorUrl || null,
        authorPictureUrl: details.authorPictureUrl || null,
        authorBio: details.authorBio || null,
        authorLinksX: details.authorLinksX || null,
        authorLinksLinkedin: details.authorLinksLinkedin || null,
        authorLinksWebsite: details.authorLinksWebsite || null,
        coverImageUrl: details.coverImageUrl || "/blog/article-title.webp",
        ogImageUrl: details.ogImageUrl || details.coverImageUrl || "/blog/article-title.webp",
        metaTitle: details.metaTitle || details.title || "",
        metaDescription: details.metaDescription || details.excerpt || "",
        metaKeywords: normalizeStringArray(details.metaKeywords),
        canonicalUrl: details.canonicalUrl || null,
        metaRobots: details.metaRobots || "index,follow",
        faq: normalizeFaqItems(details.faq),
        insightsData: details.insightsData || null,
      }

      await saveArticle(payload)
      setSuccess(true)
      setSuccessMessage(`"${post.title}" moved to ${nextStatus}.`)

      if (activeArticleSlug === post.slug) {
        setStatus(nextStatus)
        setActiveArticleUpdatedAt(new Date().toISOString())
        const nextPayload = { ...buildCreatePayload(content.trim() || insightsMarkdownDraft), status: nextStatus }
        setBaseEditorSnapshot(serializePayload(nextPayload))
      }

      await fetchLibraryPosts()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update article status."
      setError(message)
    } finally {
      setStatusUpdatingSlug(null)
    }
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(value))
    }
    setSuccess(false)
    setTopicPlan(null)
    setFactCheck(null)
    setClaimCriticisms({})
    setClaimEnhanced({})
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

  const addInsightsSection = () => {
    const nextId = `sec-${Date.now()}-${Math.round(Math.random() * 1000)}`
    setInsightsSections((prev) => [
      ...prev,
      {
        id: nextId,
        heading: "",
        sentences: ["", ""],
        callout: "",
        imageUrl: "",
        imageAlt: "",
        imagePlacement: "after-heading",
      },
    ])
    setActiveInsightsSectionId(nextId)
  }

  const removeInsightsSection = (id: string) => {
    setInsightsSections((prev) => prev.filter((section) => section.id !== id))
    setSectionImageFiles((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSectionImageUploading((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSectionImageStatus((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const reorderInsightsSections = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    setInsightsSections((prev) => {
      const fromIndex = prev.findIndex((section) => section.id === fromId)
      const toIndex = prev.findIndex((section) => section.id === toId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  useEffect(() => {
    if (insightsSections.length === 0) return
    const exists = insightsSections.some((section) => section.id === activeInsightsSectionId)
    if (!exists) {
      setActiveInsightsSectionId(insightsSections[0].id)
    }
  }, [activeInsightsSectionId, insightsSections])

  const updateInsightsSection = (id: string, patch: Partial<InsightsSectionDraft>) => {
    setInsightsSections((prev) =>
      prev.map((section) => (section.id === id ? { ...section, ...patch } : section))
    )
  }

  const updateInsightsSentence = (id: string, sentenceIndex: number, value: string) => {
    setInsightsSections((prev) =>
      prev.map((section) => {
        if (section.id !== id) return section
        const next = [...section.sentences]
        next[sentenceIndex] = value
        return { ...section, sentences: next }
      })
    )
  }

  const addInsightsSentence = (id: string) => {
    setInsightsSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, sentences: [...section.sentences, ""] } : section
      )
    )
  }

  const removeInsightsSentence = (id: string, sentenceIndex: number) => {
    setInsightsSections((prev) =>
      prev.map((section) => {
        if (section.id !== id || section.sentences.length <= 1) return section
        return { ...section, sentences: section.sentences.filter((_, idx) => idx !== sentenceIndex) }
      })
    )
  }

  const mergeBlocksForSave = (): any[] => {
    const result: any[] = []
    insightsSections.forEach((section, idx) => {
      result.push({ type: "heading", text: section.heading })
      if (section.imageUrl) {
        result.push({ type: "image", url: section.imageUrl, alt: section.imageAlt || section.heading })
      }
      section.sentences.forEach((s) => { if (s.trim()) result.push({ type: "paragraph", text: s }) })
      if (section.callout.trim()) result.push({ type: "callout", text: section.callout })
      interactiveBlocks
        .filter((p) => p.afterSectionIndex === idx)
        .forEach((p) => result.push(p.block))
    })
    return result
  }

  const handleSuggestInteractiveBlocks = async () => {
    if (!title.trim()) { setSuggestBlocksError("Please set a title first."); return }
    setSuggestingBlocks(true)
    setSuggestBlocksError(null)
    try {
      const response = await fetch("/api/blog/suggest-interactive-blocks", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          excerpt: excerpt.trim(),
          path: insightsPath,
          sections: insightsSections.map((s) => ({ heading: s.heading, sentences: s.sentences, callout: s.callout })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to suggest blocks")
      if (Array.isArray(data.placements)) setInteractiveBlocks(data.placements)
    } catch (err) {
      setSuggestBlocksError(err instanceof Error ? err.message : "Failed to suggest blocks")
    } finally {
      setSuggestingBlocks(false)
    }
  }

  const addInteractiveBlock = () => {
    setInteractiveBlocks((prev) => [
      ...prev,
      { afterSectionIndex: 0, block: { type: "checkpoint", question: "", options: [{ text: "", correct: true, explanation: "" }] } },
    ])
  }

  const removeInteractiveBlock = (idx: number) => {
    setInteractiveBlocks((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateInteractiveBlock = (idx: number, patch: Partial<InteractiveBlockPlacement>) => {
    setInteractiveBlocks((prev) => prev.map((b, i) => i === idx ? { ...b, ...patch } : b))
  }

  const BLOCK_TYPE_OPTIONS: Array<{ value: InteractiveBlockSpec["type"]; label: string }> = [
    { value: "checkpoint", label: "Checkpoint Quiz" },
    { value: "calculator", label: "Calculator" },
    { value: "predict", label: "Predict & Reveal" },
    { value: "jenga", label: "Liquidation Jenga" },
    { value: "vault-builder", label: "Vault Builder" },
    { value: "borrowing-power", label: "Borrowing Power" },
    { value: "leverage-seesaw", label: "Leverage Seesaw" },
    { value: "rate-highway", label: "Rate Highway" },
    { value: "liquidation-dominoes", label: "Liquidation Dominoes" },
    { value: "apy-snowball", label: "APY Snowball" },
    { value: "position-builder", label: "Position Builder" },
  ]

  const defaultBlockForType = (type: InteractiveBlockSpec["type"]): InteractiveBlockSpec => {
    if (type === "calculator") return { type: "calculator", variant: "health-factor" }
    if (type === "predict") return { type: "predict", prompt: "", options: ["", ""], correctIndex: 0, reveal: "" }
    if (type === "checkpoint") return { type: "checkpoint", question: "", options: [{ text: "", correct: true, explanation: "" }] }
    if (type === "jenga") return { type: "jenga" }
    if (type === "vault-builder") return { type: "vault-builder" }
    if (type === "borrowing-power") return { type: "borrowing-power" }
    if (type === "leverage-seesaw") return { type: "leverage-seesaw" }
    if (type === "rate-highway") return { type: "rate-highway" }
    if (type === "liquidation-dominoes") return { type: "liquidation-dominoes" }
    if (type === "apy-snowball") return { type: "apy-snowball" }
    return { type: "position-builder" }
  }

  const isGoodSentenceLength = (value: string) => {
    const len = value.trim().length
    return len >= 70 && len <= 160
  }

  const normalizeImagePlacement = (value?: string): string => {
    if (!value) return "after-heading"
    if (value === "after-heading" || value === "after-callout" || value === "after-section") return value
    if (/^after-sentence-\d+$/.test(value)) return value
    return "after-heading"
  }

  const getImagePlacementOptions = (sentenceCount: number) => {
    const base = [{ value: "after-heading", label: "After heading" }]
    const dynamic = Array.from({ length: Math.max(0, sentenceCount) }, (_, idx) => ({
      value: `after-sentence-${idx + 1}`,
      label: `After sentence ${idx + 1}`,
    }))
    return [...base, ...dynamic, { value: "after-callout", label: "After callout" }, { value: "after-section", label: "End of section" }]
  }

  const renderSectionImageMarkdown = (section: InsightsSectionDraft) => {
    const url = section.imageUrl?.trim()
    if (!url) return ""
    const alt = section.imageAlt?.trim() || section.heading?.trim() || "Section image"
    return `![${alt}](${url})`
  }

  const handleUploadInsightsSectionImage = async (section: InsightsSectionDraft) => {
    const file = sectionImageFiles[section.id]
    if (!file) {
      setSectionImageStatus((prev) => ({ ...prev, [section.id]: "Please select an image first." }))
      return
    }

    if (!ALLOWED_SECTION_IMAGE_TYPES.has(file.type)) {
      setSectionImageStatus((prev) => ({
        ...prev,
        [section.id]: "Unsupported image type. Use JPG, PNG, WEBP, GIF, or AVIF.",
      }))
      return
    }

    if (file.size > MAX_SECTION_IMAGE_BYTES) {
      setSectionImageStatus((prev) => ({
        ...prev,
        [section.id]: "Image is too large. Maximum allowed size is 8 MB.",
      }))
      return
    }

    const effectiveSlug = slug || generateSlug(title) || "insights-article"
    const formData = new FormData()
    formData.append("file", file)
    formData.append("slug", effectiveSlug)
    formData.append("sectionId", section.id)

    setSectionImageUploading((prev) => ({ ...prev, [section.id]: true }))
    setSectionImageStatus((prev) => ({ ...prev, [section.id]: "Uploading to R2..." }))

    try {
      const headers: Record<string, string> = {}
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()

      const response = await fetch("/api/blog/upload-insights-image", {
        method: "POST",
        headers,
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Image upload failed.")
      }

      updateInsightsSection(section.id, { imageUrl: data.url || "", imageAlt: section.imageAlt || section.heading || "Section image" })
      setSectionImageStatus((prev) => ({ ...prev, [section.id]: "Image uploaded to R2." }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown image upload error."
      setSectionImageStatus((prev) => ({ ...prev, [section.id]: message }))
    } finally {
      setSectionImageUploading((prev) => ({ ...prev, [section.id]: false }))
    }
  }

  const parseInsightsPathFromLabel = (value: string): InsightsPath | undefined => {
    const normalized = value.toLowerCase()
    if (normalized.includes("starter")) return "starter"
    if (normalized.includes("yield")) return "yield"
    if (normalized.includes("risk")) return "risk"
    if (normalized.includes("market")) return "market"
    if (normalized.includes("action") || normalized.includes("use peridot")) return "action"
    return undefined
  }

  const parseInsightsMarkdown = (markdown: string): ParsedInsightsMarkdown | null => {
    const normalized = markdown.replace(/\r/g, "")
    if (!normalized.trim()) return null

    const lines = normalized.split("\n")
    let title: string | undefined
    const excerptLines: string[] = []
    let path: InsightsPath | undefined
    const warnings: string[] = []
    let currentSection: ParsedInsightsMarkdown["sections"][number] | null = null
    const sections: ParsedInsightsMarkdown["sections"] = []

    const pushCurrentSection = () => {
      if (!currentSection) return
      const cleanedSentences = currentSection.sentences.map((s) => s.trim()).filter(Boolean)
      sections.push({
        heading: currentSection.heading.trim(),
        sentences: cleanedSentences.length ? cleanedSentences : [""],
        callout: currentSection.callout.trim(),
        imageUrl: currentSection.imageUrl?.trim() || "",
        imageAlt: currentSection.imageAlt?.trim() || "",
        imagePlacement: normalizeImagePlacement(currentSection.imagePlacement),
      })
      currentSection = null
    }

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      if (!title && line.startsWith("# ")) {
        title = line.replace(/^#\s+/, "").trim()
        continue
      }
      if (/^path\s*:/i.test(line)) {
        const parsedPath = parseInsightsPathFromLabel(line.replace(/^path\s*:/i, "").trim())
        if (parsedPath) path = parsedPath
        continue
      }
      if (line.startsWith("## ")) {
        pushCurrentSection()
        currentSection = {
          heading: line.replace(/^##\s+/, "").trim(),
          sentences: [],
          callout: "",
        }
        continue
      }
      if (currentSection) {
        if (line.startsWith(">")) {
          const calloutPart = line.replace(/^>\s*/, "").trim()
          currentSection.callout = currentSection.callout
            ? `${currentSection.callout} ${calloutPart}`.trim()
            : calloutPart
        } else if (line.startsWith("![") && /\]\(([^)]+)\)$/.test(line)) {
          const match = line.match(/^!\[(.*?)\]\(([^)]+)\)$/)
          if (match) {
            if (!currentSection.imageUrl) {
              currentSection.imageAlt = match[1]?.trim() || ""
              currentSection.imageUrl = match[2]?.trim() || ""
              const sentenceIdx = currentSection.sentences.length
              currentSection.imagePlacement =
                sentenceIdx === 0 ? "after-heading" : `after-sentence-${sentenceIdx}`
            } else {
              const sectionLabel = currentSection.heading || `Section ${sections.length + 1}`
              warnings.push(`Only one image is supported per section. Extra image ignored in "${sectionLabel}".`)
            }
          }
        } else {
          currentSection.sentences.push(line)
        }
      } else if (!line.startsWith("#")) {
        excerptLines.push(line)
      }
    }
    pushCurrentSection()
    if (!sections.length && excerptLines.length) {
      sections.push({
        heading: "Main section",
        sentences: excerptLines.slice(0, 3).filter(Boolean),
        callout: "",
        imageUrl: "",
        imageAlt: "",
        imagePlacement: "after-heading",
      })
    }
    if (!sections.length) return null
    return { title, excerpt: excerptLines.join(" ").trim() || undefined, path, warnings, sections }
  }

  const applyInsightsMarkdownToBuilder = (markdown: string) => {
    const parsed = parseInsightsMarkdown(markdown)
    if (!parsed) {
      setInsightsMarkdownStatus("Markdown import failed. Please include at least one ## section.")
      return
    }
    if (parsed.title) setTitle(parsed.title)
    if (parsed.excerpt) setExcerpt(parsed.excerpt)
    if (parsed.path) setInsightsPath(parsed.path)
    const nextSections = parsed.sections.map((section, idx) => ({
      id: `md-sec-${idx + 1}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      heading: section.heading,
      sentences: section.sentences.length ? section.sentences : [""],
      callout: section.callout,
      imageUrl: section.imageUrl || "",
      imageAlt: section.imageAlt || "",
      imagePlacement: normalizeImagePlacement(section.imagePlacement),
    }))
    setInsightsSections(nextSections)
    setActiveInsightsSectionId(nextSections[0].id)
    const baseMessage = `Markdown imported. ${nextSections.length} section${nextSections.length === 1 ? "" : "s"} synced.`
    if (parsed.warnings?.length) {
      setInsightsMarkdownStatus(`${baseMessage} ${parsed.warnings[0]}`)
    } else {
      setInsightsMarkdownStatus(baseMessage)
    }
  }

  const handleGenerateSingleInsightsSection = async (sectionId: string) => {
    const targetSectionIndex = insightsSections.findIndex((section) => section.id === sectionId)
    if (targetSectionIndex < 0) return
    if (!title.trim()) {
      setError("Please set an article title first.")
      return
    }
    setSectionGenerating((prev) => ({ ...prev, [sectionId]: true }))
    setSectionErrors((prev) => ({ ...prev, [sectionId]: "" }))
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()
      const response = await fetch("/api/blog/generate-insights-section", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          excerpt: excerpt.trim(),
          insightsPath,
          targetSectionIndex,
          sections: insightsSections.map((section) => ({
            heading: section.heading,
            sentences: section.sentences,
            callout: section.callout,
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate section.")
      }
      const generated = data.section as { heading?: string; sentences?: string[]; callout?: string }
      updateInsightsSection(sectionId, {
        heading: generated.heading || "",
        sentences: Array.isArray(generated.sentences) && generated.sentences.length > 0 ? generated.sentences : [""],
        callout: generated.callout || "",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate section."
      setSectionErrors((prev) => ({ ...prev, [sectionId]: message }))
    } finally {
      setSectionGenerating((prev) => ({ ...prev, [sectionId]: false }))
    }
  }

  const handleUploadCoverImage = async () => {
    if (!imageFile) {
      setUploadStatus("Please select an image file first.")
      return
    }
    if (!ALLOWED_COVER_IMAGE_TYPES.has(imageFile.type)) {
      setUploadStatus("Unsupported image type. Use JPG, PNG, WEBP, GIF, AVIF or SVG.")
      return
    }
    if (imageFile.size > MAX_SECTION_IMAGE_BYTES) {
      setUploadStatus("Image is too large. Maximum allowed size is 8 MB.")
      return
    }
    const effectiveSlug = slug || generateSlug(title) || "article"
    const formData = new FormData()
    formData.append("file", imageFile)
    formData.append("slug", effectiveSlug)
    setUploadingImage(true)
    setUploadStatus("Uploading image to R2...")
    setError(null)
    try {
      const headers: Record<string, string> = {}
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()

      const response = await fetch("/api/blog/upload-image", {
        method: "POST",
        headers,
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Upload failed.")
      }
      if (data.url) {
        setCoverImageUrl(data.url)
        setOgImageUrl(data.url)
        setUploadStatus("Image uploaded successfully. URL fields were updated.")
        setSuccess(true)
        setSuccessMessage("Cover image uploaded successfully.")
      } else {
        throw new Error("Unexpected response: No URL received.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upload error."
      setUploadStatus(message)
    } finally {
      setUploadingImage(false)
    }
  }

  /**
   * Re-host a pasted cover URL on our own CDN. Pasting a foreign URL straight
   * into the field looks like it works and then renders nothing, because
   * next/image only serves hosts listed in next.config.js.
   */
  const handleImportCoverImageUrl = async () => {
    const sourceUrl = coverImageUrl.trim()
    if (!sourceUrl) {
      setUploadStatus("Paste an image URL first.")
      return
    }
    if (isSelfHostedImageUrl(sourceUrl)) {
      setUploadStatus("This URL is already hosted by us — nothing to import.")
      return
    }

    const effectiveSlug = slug || generateSlug(title) || "article"
    setImportingCoverUrl(true)
    setUploadStatus("Downloading image and storing it on our CDN...")
    setError(null)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()

      const response = await fetch("/api/blog/upload-image", {
        method: "POST",
        headers,
        body: JSON.stringify({ sourceUrl, slug: effectiveSlug }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Import failed.")
      if (!data.url) throw new Error("Unexpected response: No URL received.")

      setCoverImageUrl(data.url)
      setOgImageUrl(data.url)
      setUploadStatus("Image imported. URL fields now point at our CDN.")
      setSuccess(true)
      setSuccessMessage("Cover image imported successfully.")
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : "Unknown import error.")
    } finally {
      setImportingCoverUrl(false)
    }
  }

  const handleGenerateWithAI = async () => {
    const titleOrKeyword = title.trim()
    if (!titleOrKeyword) {
      setError("Please enter a title or keyword before using AI generation.")
      return
    }
    setGenerating(true)
    setError(null)
    setSuccess(false)
    setShowProgressDialog(true)
    const initialSteps: StepStatus[] = [
      { step: "topic-plan", status: "pending" },
      { step: "base-info", status: "pending" },
      { step: "article-content", status: "pending" },
      ...(isInsightsArticle ? [{ step: "interactive-blocks" as any, status: "pending" as const }] : []),
      { step: "meta-info", status: "pending" },
      { step: "faq", status: "pending" },
      { step: "cover-image", status: "pending" },
      { step: "concept-image", status: "pending" },
      { step: "explanations", status: "pending" },
      { step: "fact-check", status: "pending" },
    ]
    setProgressSteps(initialSteps)
    setCurrentProgressStep(undefined)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()
      const response = await fetch("/api/blog/generate-stream", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: titleOrKeyword,
          mode: isInsightsArticle ? "insights" : "blog",
          insightsPath,
          ...(isInsightsArticle && chapterTitle.trim() ? {
            chapterTitle: chapterTitle.trim(),
            chapterOrder,
            lessonOrder,
          } : {}),
        })
      })
      if (!response.ok) {
        throw new Error("Failed to start generation")
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) {
        throw new Error("No response body")
      }
      let buffer = ""
      let finalData: Record<string, unknown> | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let lastIndex = 0
        while (true) {
          const eventEnd = buffer.indexOf("\n\n", lastIndex)
          if (eventEnd === -1) break
          const line = buffer.slice(lastIndex, eventEnd)
          lastIndex = eventEnd + 2
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr) continue
              const event = JSON.parse(jsonStr)
              const { step, status, message, data } = event
              if (step === "error") throw new Error(message || "Unknown error occurred")
              setProgressSteps((prev) =>
                prev.map((s) =>
                  s.step === step
                    ? { ...s, status: status as StepStatus["status"], message, error: status === "error" ? message : undefined }
                    : s
                )
              )
              if (status === "in-progress") setCurrentProgressStep(step as GenerationStep)
              else if (status === "completed") {
                setCurrentProgressStep(undefined)
                if (step === "complete" && data) finalData = data
              }
            } catch (e) {
              console.error("Error parsing event:", e)
            }
          }
        }
        buffer = buffer.slice(lastIndex)
      }
      if (finalData) {
        const streamed = finalData as any
        setTopicPlan(streamed.topicPlan ?? null)
        const base = streamed.base ?? {}
        const article = streamed.article ?? {}
        const meta = streamed.meta ?? {}
        const faqItems: FAQItem[] = Array.isArray(streamed.faq) ? streamed.faq : []
        const insightsDraft = streamed.insightsDraft ?? null
        setTitle(base.title ?? titleOrKeyword)
        setSlug(base.slug ?? generateSlug(base.title ?? titleOrKeyword))
        setExcerpt(base.excerpt ?? excerpt)
        setCategory(base.category ?? category)
        setTagsInput(Array.isArray(base.tags) ? base.tags.join(", ") : tagsInput)
        setMetaKeywords(Array.isArray(base.keywords) ? base.keywords.join(", ") : metaKeywords)
        if (base.funnelStage) setFunnelStage(base.funnelStage as FunnelStage)
        if (base.peridotCta) setPeridotCta(base.peridotCta as string)
        if (base.peridotRelevance) setPeridotRelevance(base.peridotRelevance as "high" | "medium" | "low" | "none")
        if (base.actionArticleSuggestion?.title) setActionSuggestionTitle(base.actionArticleSuggestion.title)
        if (base.actionArticleSuggestion?.slug) setActionSuggestionSlug(base.actionArticleSuggestion.slug)
        setContent(article.content ?? content)
        setMetaTitle(meta.metaTitle ?? base.title ?? metaTitle)
        setMetaDescription(meta.metaDescription ?? meta.summary ?? metaDescription)
        setCanonicalUrl(meta.canonicalUrl ?? canonicalUrl)
        setMetaRobots(meta.metaRobots ?? metaRobots)
        setFaq(faqItems.length ? faqItems : faq)
        if (isInsightsArticle && insightsDraft?.sections?.length) {
          if (insightsDraft.path) setInsightsPath(insightsDraft.path)
          const nextSections = insightsDraft.sections.map((section: any, idx: number) => ({
              id: `ai-sec-${idx + 1}-${Date.now()}`,
              heading: section.heading || "",
              sentences: Array.isArray(section.sentences) && section.sentences.length > 0 ? section.sentences : [""],
              callout: section.callout || "",
              imageUrl: section.imageUrl || "",
              imageAlt: section.imageAlt || "",
              imagePlacement: normalizeImagePlacement(section.imagePlacement),
            }))
          setInsightsSections(nextSections)
          if (nextSections.length > 0) setActiveInsightsSectionId(nextSections[0].id)
          if (Array.isArray(insightsDraft.interactiveBlocks) && insightsDraft.interactiveBlocks.length > 0) {
            setInteractiveBlocks(insightsDraft.interactiveBlocks)
          } else {
            setInteractiveBlocks([])
          }
        }
        if (streamed.coverImageUrl) {
          setCoverImageUrl(streamed.coverImageUrl)
          setOgImageUrl(streamed.coverImageUrl)
        }
        if (streamed.factCheck) setFactCheck(streamed.factCheck)
        setSuccess(true)
        setSuccessMessage("AI generation completed. Review content and save.")
      }
      setTimeout(() => setShowProgressDialog(false), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown content generation error."
      setError(message)
      setProgressSteps((prev) =>
        prev.map((s) => s.status === "in-progress" ? { ...s, status: "error", error: message } : s)
      )
      setTimeout(() => setShowProgressDialog(false), 2000)
    } finally {
      setGenerating(false)
      setCurrentProgressStep(undefined)
    }
  }

  const handleRegenerateArticle = async () => {
    if (!activeArticleSlug) return
    if (!window.confirm(`Regenerate "${title}"? All current content will be replaced with a fresh AI version. The slug and article record are preserved.`)) return

    setGenerating(true)
    setError(null)
    setSuccess(false)
    setShowProgressDialog(true)
    const initialSteps: StepStatus[] = [
      { step: "topic-plan", status: "pending" },
      { step: "base-info", status: "pending" },
      { step: "article-content", status: "pending" },
      ...(isInsightsArticle ? [{ step: "interactive-blocks" as any, status: "pending" as const }] : []),
      { step: "meta-info", status: "pending" },
      { step: "faq", status: "pending" },
      { step: "cover-image", status: "pending" },
      { step: "concept-image", status: "pending" },
      { step: "explanations", status: "pending" },
      { step: "fact-check", status: "pending" },
    ]
    setProgressSteps(initialSteps)
    setCurrentProgressStep(undefined)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (adminApiPassword.trim()) headers["x-admin-password"] = adminApiPassword.trim()
      const response = await fetch("/api/blog/generate-stream", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          mode: isInsightsArticle ? "insights" : "blog",
          insightsPath,
          regenerate: true,
          existingSlug: activeArticleSlug,
          ...(isInsightsArticle
            ? { existingSections: insightsSections.map((s) => ({ heading: s.heading, sentences: s.sentences, callout: s.callout })) }
            : { existingContent: content }),
          ...(isInsightsArticle && chapterTitle.trim() ? {
            chapterTitle: chapterTitle.trim(),
            chapterOrder,
            lessonOrder,
          } : {}),
        }),
      })
      if (!response.ok) throw new Error("Failed to start regeneration")
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error("No response body")
      let buffer = ""
      let finalData: Record<string, unknown> | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let lastIndex = 0
        while (true) {
          const eventEnd = buffer.indexOf("\n\n", lastIndex)
          if (eventEnd === -1) break
          const line = buffer.slice(lastIndex, eventEnd)
          lastIndex = eventEnd + 2
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr) continue
              const event = JSON.parse(jsonStr)
              const { step, status, message, data } = event
              if (step === "error") throw new Error(message || "Unknown error occurred")
              setProgressSteps((prev) =>
                prev.map((s) =>
                  s.step === step
                    ? { ...s, status: status as StepStatus["status"], message, error: status === "error" ? message : undefined }
                    : s
                )
              )
              if (status === "in-progress") setCurrentProgressStep(step as GenerationStep)
              else if (status === "completed") {
                setCurrentProgressStep(undefined)
                if (step === "complete" && data) finalData = data
              }
            } catch (e) {
              console.error("Error parsing event:", e)
            }
          }
        }
        buffer = buffer.slice(lastIndex)
      }
      if (finalData) {
        const streamed = finalData as any
        setTopicPlan(streamed.topicPlan ?? null)
        const base = streamed.base ?? {}
        const article = streamed.article ?? {}
        const meta = streamed.meta ?? {}
        const faqItems: FAQItem[] = Array.isArray(streamed.faq) ? streamed.faq : []
        const insightsDraft = streamed.insightsDraft ?? null
        setTitle(base.title ?? title)
        // Preserve the existing slug — never overwrite on regenerate
        setSlug(activeArticleSlug)
        setExcerpt(base.excerpt ?? excerpt)
        setCategory(base.category ?? category)
        setTagsInput(Array.isArray(base.tags) ? base.tags.join(", ") : tagsInput)
        setMetaKeywords(Array.isArray(base.keywords) ? base.keywords.join(", ") : metaKeywords)
        if (base.funnelStage) setFunnelStage(base.funnelStage as FunnelStage)
        if (base.peridotCta) setPeridotCta(base.peridotCta as string)
        if (base.peridotRelevance) setPeridotRelevance(base.peridotRelevance as "high" | "medium" | "low" | "none")
        if (base.actionArticleSuggestion?.title) setActionSuggestionTitle(base.actionArticleSuggestion.title)
        if (base.actionArticleSuggestion?.slug) setActionSuggestionSlug(base.actionArticleSuggestion.slug)
        setContent(article.content ?? content)
        setMetaTitle(meta.metaTitle ?? base.title ?? metaTitle)
        setMetaDescription(meta.metaDescription ?? meta.summary ?? metaDescription)
        setCanonicalUrl(meta.canonicalUrl ?? canonicalUrl)
        setMetaRobots(meta.metaRobots ?? metaRobots)
        setFaq(faqItems.length ? faqItems : faq)
        if (isInsightsArticle && insightsDraft?.sections?.length) {
          if (insightsDraft.path) setInsightsPath(insightsDraft.path)
          const nextSections = insightsDraft.sections.map((section: any, idx: number) => ({
            id: `regen-sec-${idx + 1}-${Date.now()}`,
            heading: section.heading || "",
            sentences: Array.isArray(section.sentences) && section.sentences.length > 0 ? section.sentences : [""],
            callout: section.callout || "",
            imageUrl: section.imageUrl || "",
            imageAlt: section.imageAlt || "",
            imagePlacement: normalizeImagePlacement(section.imagePlacement),
          }))
          setInsightsSections(nextSections)
          if (nextSections.length > 0) setActiveInsightsSectionId(nextSections[0].id)
          if (Array.isArray(insightsDraft.interactiveBlocks) && insightsDraft.interactiveBlocks.length > 0) {
            setInteractiveBlocks(insightsDraft.interactiveBlocks)
          } else {
            setInteractiveBlocks([])
          }
        }
        if (streamed.coverImageUrl) {
          setCoverImageUrl(streamed.coverImageUrl)
          setOgImageUrl(streamed.coverImageUrl)
        }
        if (streamed.factCheck) setFactCheck(streamed.factCheck)
        setSuccess(true)
        setSuccessMessage("Article regenerated. Review and save to apply changes.")
      }
      setTimeout(() => setShowProgressDialog(false), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during regeneration."
      setError(message)
      setProgressSteps((prev) =>
        prev.map((s) => s.status === "in-progress" ? { ...s, status: "error", error: message } : s)
      )
      setTimeout(() => setShowProgressDialog(false), 2000)
    } finally {
      setGenerating(false)
      setCurrentProgressStep(undefined)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const effectiveContent = isInsightsArticle ? insightsMarkdownDraft : content
      if (!effectiveContent.trim()) throw new Error("Please add article content.")
      const payload = buildCreatePayload(effectiveContent)
      const result = await saveArticle(payload)
      setSuccess(true)
      setSuccessMessage(activeArticleSlug ? "Article updated successfully." : "Article created successfully.")
      setActiveArticleSlug(result?.article?.slug || payload.slug)
      setActiveArticleUpdatedAt(new Date().toISOString())
      setBaseEditorSnapshot(serializePayload(payload))
      await fetchLibraryPosts()
      void fetchVersions(result?.article?.slug || payload.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const metricLabel = useMemo(() => (label: string) =>
      label.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase()).trim(), [])

  const insightsMarkdownDraft = useMemo(() => {
    const pathLabel: Record<InsightsPath, string> = { starter: "DeFi Starter", yield: "Advanced Yield", risk: "Risk & Security", market: "Market Updates", action: "Use Peridot" }
    const lines: string[] = []
    lines.push(`# ${title || "Untitled Insights Article"}`)
    lines.push("")
    lines.push(`Path: ${pathLabel[insightsPath]}`)
    lines.push("")
    if (excerpt.trim()) { lines.push(excerpt.trim()); lines.push("") }
    insightsSections.forEach((section) => {
      if (!section.heading.trim()) return
      lines.push(`## ${section.heading.trim()}`)
      lines.push("")
      const imageMarkdown = renderSectionImageMarkdown(section)
      const placement = normalizeImagePlacement(section.imagePlacement)
      let imageInserted = false
      if (imageMarkdown && placement === "after-heading") { lines.push(imageMarkdown); lines.push(""); imageInserted = true }
      section.sentences.map((s) => s.trim()).filter(Boolean).forEach((sentence, sentenceIndex) => {
          lines.push(sentence)
          lines.push("")
          if (imageMarkdown && placement === `after-sentence-${sentenceIndex + 1}`) { lines.push(imageMarkdown); lines.push(""); imageInserted = true }
        })
      if (section.callout.trim()) {
        lines.push(`> ${section.callout.trim()}`)
        lines.push("")
        if (imageMarkdown && placement === "after-callout") { lines.push(imageMarkdown); lines.push(""); imageInserted = true }
      }
      if (imageMarkdown && placement === "after-section") { lines.push(imageMarkdown); lines.push(""); imageInserted = true }
      if (imageMarkdown && !imageInserted) { lines.push(imageMarkdown); lines.push("") }
    })
    return lines.join("\n").trim()
  }, [excerpt, insightsPath, insightsSections, title])

  useEffect(() => {
    if (!isEditingInsightsMarkdown) setInsightsMarkdownInput(insightsMarkdownDraft)
  }, [insightsMarkdownDraft, isEditingInsightsMarkdown])

  useEffect(() => {
    if (contentComposerTab === "insights" && !isRestoring) {
      setContent(insightsMarkdownDraft)
    }
  }, [insightsMarkdownDraft, contentComposerTab, isRestoring])

  const activeContent = contentComposerTab === "insights" ? insightsMarkdownDraft : content
  const articleWordCount = useMemo(() => activeContent.trim().split(/\s+/).filter(Boolean).length, [activeContent])
  const readTimeMinutes = Math.max(1, Math.round(articleWordCount / 220))
  const titleLength = title.trim().length
  const excerptLength = excerpt.trim().length
  const metaDescriptionLength = metaDescription.trim().length
  const essentialsFilled = [title.trim(), slug.trim(), excerpt.trim(), activeContent.trim()].filter(Boolean).length
  const completionPercent = Math.round((essentialsFilled / 4) * 100)
  const sentenceChecks = insightsSections.flatMap((section) => section.sentences)
  const goodInsightSentences = sentenceChecks.filter((sentence) => isGoodSentenceLength(sentence)).length
  const insightsSentenceQuality = sentenceChecks.length > 0 ? Math.round((goodInsightSentences / sentenceChecks.length) * 100) : 0
  const activeInsightsSection = insightsSections.find((section) => section.id === activeInsightsSectionId) ?? insightsSections[0]
  const activeInsightsSectionIndex = insightsSections.findIndex((section) => section.id === activeInsightsSection?.id)
  const structuredInsightsCount = insightsSections.filter((section) => section.heading.trim() && section.sentences.some((sentence) => sentence.trim())).length
  const displayedInsightsMarkdown = isEditingInsightsMarkdown ? insightsMarkdownInput : insightsMarkdownDraft
  const effectiveContentForSave = contentComposerTab === "insights" ? insightsMarkdownDraft : content
  const currentEditorSnapshot = serializePayload(buildCreatePayload(effectiveContentForSave))
  const hasUnsavedChanges = Boolean(baseEditorSnapshot && baseEditorSnapshot !== currentEditorSnapshot)
  const saveActionLabel = activeArticleSlug ? "Update Article" : "Save Article"

  const filteredLibraryPosts = useMemo(() => {
    const query = librarySearch.trim().toLowerCase()
    return libraryPosts.filter((post) => {
      if (libraryFilter !== "all" && post.status !== libraryFilter) return false
      if (libraryTypeFilter === "blog" && post.hasInsights) return false
      if (libraryTypeFilter === "insights" && !post.hasInsights) return false
      if (libraryPathFilter !== "all" && post.insightsPath !== libraryPathFilter) return false
      if (!query) return true
      return (post.title?.toLowerCase().includes(query) || post.slug?.toLowerCase().includes(query) || post.excerpt?.toLowerCase().includes(query))
    })
  }, [libraryFilter, libraryTypeFilter, libraryPathFilter, libraryPosts, librarySearch])

  return (
    <>
      <GenerationProgressDialog open={showProgressDialog} steps={progressSteps} currentStep={currentProgressStep} />
      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        <Card className="mb-6 border-border/70">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-lg">Article Library</CardTitle>
                <p className="text-sm text-muted-foreground">Load old posts for editing or move them between draft and published.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={resetEditorForNewArticle}>
                  <Plus className="h-4 w-4" /> New Article
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={() => void fetchLibraryPosts()} disabled={libraryLoading}>
                  {libraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Row 1: type pills + status filter */}
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "blog", "insights"] as ArticleTypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setLibraryTypeFilter(t); if (t !== "insights") setLibraryPathFilter("all") }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${libraryTypeFilter === t ? "bg-primary text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                >
                  {t === "all" ? "All" : t === "blog" ? "Blog" : "Insights"}
                </button>
              ))}
              {libraryTypeFilter === "insights" && (
                <Select value={libraryPathFilter} onValueChange={setLibraryPathFilter}>
                  <SelectTrigger className="h-7 w-auto gap-1 rounded-full px-3 text-xs">
                    <SelectValue placeholder="All paths" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All paths</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="yield">Earn Interest</SelectItem>
                    <SelectItem value="risk">Stay Safe</SelectItem>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="action">Use Peridot</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="ml-auto">
                <Select value={libraryFilter} onValueChange={(value) => setLibraryFilter(value as ArticleLibraryFilter)}>
                  <SelectTrigger className="h-7 w-auto gap-1 rounded-full px-3 text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Row 2: search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Search by title, slug, or excerpt" className="pl-9" />
            </div>
            {libraryError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{libraryError}</div> : null}
            <div className="rounded-md border border-border/60">
              <div className="max-h-72 overflow-y-auto">
                {libraryLoading && filteredLibraryPosts.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading article library...</div>
                ) : filteredLibraryPosts.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No articles found for this filter.</div>
                ) : (
                  filteredLibraryPosts.map((post) => {
                    const isCurrent = activeArticleSlug === post.slug
                    const nextStatus: ArticleStatus = post.status === "published" ? "draft" : "published"
                    return (
                      <div key={post.id} className={`flex flex-col gap-3 border-b border-border/60 p-3 last:border-b-0 md:flex-row md:items-center md:justify-between ${isCurrent ? "bg-muted/30" : ""}`}>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{post.title}</p>
                            <Badge variant={post.status === "published" ? "default" : "secondary"}>{post.status}</Badge>
                            {post.hasInsights
                              ? <Badge variant="outline" className="border-primary/40 text-primary">Insights</Badge>
                              : <Badge variant="outline">Blog</Badge>
                            }
                            {post.hasInsights && post.insightsPath && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {post.insightsPath}
                                {post.insightsChapterOrder != null ? ` · Ch${post.insightsChapterOrder}` : ""}
                                {post.insightsLessonOrder != null ? ` L${post.insightsLessonOrder}` : ""}
                              </Badge>
                            )}
                            {isCurrent ? <Badge variant="outline">Editing</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{post.slug}</p>
                          <p className="text-xs text-muted-foreground">Updated {formatDateTime(post.updatedAt || post.createdAt)} {post.publishedAt ? `• Published ${formatDateTime(post.publishedAt)}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" size="sm" variant={isCurrent ? "default" : "outline"} className="gap-1.5" onClick={() => void loadArticleForEditing(post.slug)} disabled={articleLoadingSlug === post.slug}>
                            {articleLoadingSlug === post.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} {isCurrent ? "Editing" : "Edit"}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => void toggleArticleStatus(post, nextStatus)} disabled={statusUpdatingSlug === post.slug}>
                            {statusUpdatingSlug === post.slug ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving...</> : (nextStatus === "published" ? "Publish" : "Move to Draft")}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2 border-border/70 bg-gradient-to-br from-background to-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-emerald-500" /> {activeArticleSlug ? "Edit Article" : "Create New Article"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {activeArticleSlug ? `Editing slug "${activeArticleSlug}". Save to update, or use New Article to start fresh.` : "Clean workflow for Blog and Insights content."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Mode: {isInsightsArticle ? "Insights Builder" : "Blog Builder"}</Badge>
                <Badge variant={completionPercent >= 75 ? "default" : "outline"}>Completion {completionPercent}%</Badge>
                <Badge variant="outline">{articleWordCount} words</Badge>
                <Badge variant="outline">~{readTimeMinutes} min read</Badge>
                {activeArticleSlug ? <Badge variant="outline">Last update: {formatDateTime(activeArticleUpdatedAt)}</Badge> : null}
                {hasUnsavedChanges ? <Badge variant="secondary">Unsaved changes</Badge> : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Article completeness</span><span>{completionPercent}%</span></div>
                <Progress value={completionPercent} className="h-2" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-muted/20">
            <CardHeader className="pb-2"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" className="w-full justify-start gap-2" variant="outline" onClick={handleGenerateWithAI} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {generating ? "Generating..." : "Generate with AI"}
              </Button>
              {activeArticleSlug && (
                <Button
                  type="button"
                  className="w-full justify-start gap-2"
                  variant="outline"
                  onClick={handleRegenerateArticle}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {generating ? "Regenerating..." : "Regenerate Article"}
                </Button>
              )}
              <Button type="submit" form="create-article-form" disabled={loading} className="w-full justify-start gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {loading ? "Saving..." : saveActionLabel}
              </Button>
            </CardContent>
          </Card>
        </div>

        <form id="create-article-form" onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <Tabs value={editorSectionTab} onValueChange={(value) => setEditorSectionTab(value as any)} className="space-y-4">
              <TabsList className="admin-editor-tabs grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2 md:grid-cols-7">
                <TabsTrigger value="basic">Basics</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="author">Author</TabsTrigger>
                <TabsTrigger value="images">Images</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="faq">FAQ</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="quad-tab-content mt-0">
                <Card className="border-border/70">
                  <CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-emerald-500" /> Basic Information</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div><Label htmlFor="title">Title *</Label><Input id="title" value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Enter article title" required /></div>
                    <div><Label htmlFor="adminApiPassword">Admin API Password (optional)</Label><Input id="adminApiPassword" type="password" value={adminApiPassword} onChange={(e) => setAdminApiPassword(e.target.value)} placeholder="If enabled on server" /></div>
                    <div><Label htmlFor="slug">Slug *</Label><Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="article-url-slug" required /></div>
                    <div><Label htmlFor="excerpt">Excerpt *</Label><Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Brief description" rows={3} required /></div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div><Label htmlFor="status">Status</Label><Select value={status} onValueChange={(v: any) => setStatus(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem></SelectContent></Select></div>
                      <div><Label htmlFor="category">Category</Label><Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Education, etc." /></div>
                    </div>
                    <div><Label htmlFor="tags">Tags (comma-separated)</Label><Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="DeFi, Lending" /></div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="funnelStage">Funnel Stage</Label>
                        <Select value={funnelStage} onValueChange={(v) => setFunnelStage(v as FunnelStage)}>
                          <SelectTrigger id="funnelStage"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="awareness">Awareness — Education</SelectItem>
                            <SelectItem value="consideration">Consideration — Compare & Evaluate</SelectItem>
                            <SelectItem value="conversion">Conversion — Drive Action</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">AI adapts content structure and tone to this stage.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="peridotCta">Peridot CTA</Label>
                        <Input
                          id="peridotCta"
                          value={peridotCta}
                          onChange={(e) => setPeridotCta(e.target.value)}
                          placeholder="e.g. Deposit USDC on Peridot"
                        />
                        <p className="text-xs text-muted-foreground">Injected at the end of conversion-stage articles.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="peridotRelevance">Peridot Relevance</Label>
                      <Select value={peridotRelevance} onValueChange={(v) => setPeridotRelevance(v as "high" | "medium" | "low" | "none")}>
                        <SelectTrigger id="peridotRelevance"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None — topic does not connect to Peridot</SelectItem>
                          <SelectItem value="low">Low — tangential mention possible</SelectItem>
                          <SelectItem value="medium">Medium — Peridot fits naturally</SelectItem>
                          <SelectItem value="high">High — article is directly about using Peridot</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Controls whether the action-refresher card appears in the reader.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="content" className="quad-tab-content mt-0">
                <Card className="border-border/70">
                  <CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-emerald-500" /> Article Content</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs value={contentComposerTab} onValueChange={(value: any) => { setContentComposerTab(value); setIsInsightsArticle(value === "insights") }} className="mt-2">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="markdown">Blog Article builder</TabsTrigger>
                        <TabsTrigger value="insights">Insights Builder</TabsTrigger>
                      </TabsList>
                      <TabsContent value="markdown" className="space-y-3 pt-3">
                        <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Article Title\n\nContent..." rows={20} className="font-mono text-sm" />
                      </TabsContent>
                      <TabsContent value="insights" className="space-y-4 pt-3">
                        {/* Curriculum position */}
                        <Card className="border-emerald-500/20 bg-emerald-500/5">
                          <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                              <BookOpen className="h-4 w-4 text-emerald-500" />
                              Where does this lesson fit?
                              {curriculumLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label>Chapter</Label>
                                <Select
                                  value={chapterSlug || "__new__"}
                                  onValueChange={handleChapterSelect}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select or create chapter" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {curriculumChapters.map((ch) => (
                                      <SelectItem key={ch.slug} value={ch.slug}>
                                        Ch {ch.order}: {ch.title}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__new__">＋ New chapter</SelectItem>
                                  </SelectContent>
                                </Select>
                                {/* Case 1: no chapter assigned — lesson will be orphaned */}
                                {!chapterSlug && !chapterTitle.trim() && (
                                  <p className="text-xs text-amber-500/80">No chapter assigned — this lesson won&apos;t appear in any curriculum path.</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label>Lesson # in chapter</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={lessonOrder}
                                  onChange={(e) => setLessonOrder(Math.max(1, parseInt(e.target.value) || 1))}
                                />
                                {/* Case 2: lesson # collision in existing chapter */}
                                {(() => {
                                  const activeChapter = curriculumChapters.find((ch) => ch.slug === chapterSlug)
                                  const conflict = activeChapter?.lessons.find(
                                    (l) => l.lessonOrder === lessonOrder && l.slug !== activeArticleSlug
                                  )
                                  return conflict ? (
                                    <p className="text-xs text-amber-500/80">
                                      Lesson {lessonOrder} already taken by &quot;{conflict.title}&quot; ({conflict.status}).
                                    </p>
                                  ) : null
                                })()}
                              </div>
                            </div>
                            {!chapterSlug && (
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Chapter title</Label>
                                  <Input
                                    value={chapterTitle}
                                    onChange={(e) => setChapterTitle(e.target.value)}
                                    placeholder="e.g. Understanding Liquidity"
                                  />
                                  {/* Case 3: no chapter title → AI won't receive chapter context */}
                                  {!chapterTitle.trim() && (
                                    <p className="text-xs text-muted-foreground">AI generation won&apos;t receive chapter context until you fill in a title.</p>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Chapter #</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={chapterOrder}
                                    onChange={(e) => setChapterOrder(Math.max(1, parseInt(e.target.value) || 1))}
                                  />
                                  {/* Case 4: chapter # collision when creating new chapter */}
                                  {(() => {
                                    const conflict = curriculumChapters.find((ch) => ch.order === chapterOrder)
                                    return conflict ? (
                                      <p className="text-xs text-amber-500/80">
                                        Ch {chapterOrder} already exists: &quot;{conflict.title}&quot;.
                                      </p>
                                    ) : null
                                  })()}
                                </div>
                              </div>
                            )}
                            {curriculumChapters.length > 0 && (
                              <div className="rounded-md border border-border/60 bg-background/60 p-3 space-y-1 text-xs">
                                <p className="font-medium text-muted-foreground uppercase tracking-wide">Current {insightsPath} curriculum</p>
                                {curriculumChapters.map((ch) => (
                                  <div key={ch.slug} className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Ch {ch.order}:</span>
                                    <span className="font-medium">{ch.title}</span>
                                    <span className="text-muted-foreground">({ch.lessons.length} lesson{ch.lessons.length !== 1 ? "s" : ""})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-border/50">
                              <div className="space-y-1.5">
                                <Label htmlFor="actionSuggestionTitle">Linked Action Article Title</Label>
                                <Input
                                  id="actionSuggestionTitle"
                                  value={actionSuggestionTitle}
                                  onChange={(e) => setActionSuggestionTitle(e.target.value)}
                                  placeholder="e.g. How to Deposit USDC on Peridot"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="actionSuggestionSlug">Linked Action Article Slug</Label>
                                <Input
                                  id="actionSuggestionSlug"
                                  value={actionSuggestionSlug}
                                  onChange={(e) => setActionSuggestionSlug(e.target.value)}
                                  placeholder="e.g. how-to-deposit-usdc-on-peridot"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Use concise sentences (70-160 chars).</div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2"><Label htmlFor="insights-path">Insights Path</Label><Select value={insightsPath} onValueChange={(v: any) => setInsightsPath(v)}><SelectTrigger id="insights-path"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="starter">DeFi Starter</SelectItem><SelectItem value="yield">Advanced Yield</SelectItem><SelectItem value="risk">Risk & Security</SelectItem><SelectItem value="market">Market Updates</SelectItem><SelectItem value="action">Use Peridot (Conversion)</SelectItem></SelectContent></Select></div>
                          <div className="space-y-2"><Label>Quick Actions</Label><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={addInsightsSection}><Plus className="mr-2 h-4 w-4" /> Add Section</Button><Button type="button" onClick={() => setContent(insightsMarkdownDraft)}>Apply To Content</Button></div></div>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-12">
                          <Card className="border-border/70 lg:col-span-4"><CardHeader className="pb-3"><CardTitle className="text-base">Section Navigator</CardTitle></CardHeader><CardContent className="space-y-2"><div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                            {insightsSections.map((section, idx) => (
                              <button key={section.id} type="button" onClick={() => setActiveInsightsSectionId(section.id)} className={`w-full rounded-md border p-2 text-left transition ${activeInsightsSectionId === section.id ? "border-emerald-500/50 bg-emerald-500/10" : "border-border/70 bg-background hover:bg-muted/40"}`}>
                                <p className="text-sm font-medium">Section {idx + 1}</p><p className="mt-1 truncate text-xs text-muted-foreground">{section.heading || "No heading"}</p>
                              </button>
                            ))}
                          </div></CardContent></Card>
                          <Card className="border-border/70 lg:col-span-8"><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Section {activeInsightsSectionIndex + 1}</CardTitle><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => activeInsightsSection && handleGenerateSingleInsightsSection(activeInsightsSection.id)} disabled={!activeInsightsSection || Boolean(sectionGenerating[activeInsightsSection.id])}>{sectionGenerating[activeInsightsSection?.id || ''] ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => activeInsightsSection && removeInsightsSection(activeInsightsSection.id)} disabled={insightsSections.length <= 1}><X className="h-4 w-4" /></Button></div></div></CardHeader><CardContent className="space-y-3">
                            {activeInsightsSection && (<><div className="space-y-1"><Label>Heading</Label><Input value={activeInsightsSection.heading} onChange={(e) => updateInsightsSection(activeInsightsSection.id, { heading: e.target.value })} placeholder="Heading" /></div><div className="space-y-2"><Label>Sentences</Label>{activeInsightsSection.sentences.map((s, si) => (<div key={si} className="flex gap-2"><Input value={s} onChange={(e) => updateInsightsSentence(activeInsightsSection.id, si, e.target.value)} /><Button type="button" variant="ghost" size="sm" onClick={() => removeInsightsSentence(activeInsightsSection.id, si)} disabled={activeInsightsSection.sentences.length <= 1}><X className="h-4 w-4" /></Button></div>))}<Button type="button" variant="outline" size="sm" onClick={() => addInsightsSentence(activeInsightsSection.id)}>Add Sentence</Button></div><div className="space-y-1"><Label>Callout</Label><Input value={activeInsightsSection.callout} onChange={(e) => updateInsightsSection(activeInsightsSection.id, { callout: e.target.value })} placeholder="Callout" /></div></>)}
                          </CardContent></Card>
                        </div>
                        {/* Interactive Blocks Editor */}
                        <Card className="border-border/70">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Sparkles className="h-4 w-4 text-emerald-500" /> Interactive Blocks
                              </CardTitle>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleSuggestInteractiveBlocks()}
                                  disabled={suggestingBlocks}
                                >
                                  {suggestingBlocks ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                                  AI Block Suggestion
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={addInteractiveBlock}>
                                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Block
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Interactive components are embedded after the specified section in the article.
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {suggestBlocksError && (
                              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{suggestBlocksError}</div>
                            )}
                            {interactiveBlocks.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No interactive blocks yet. Use AI suggestion or add manually.</p>
                            ) : (
                              interactiveBlocks.map((placement, idx) => (
                                <div key={idx} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Block {idx + 1}</span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeInteractiveBlock(idx)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">After section</Label>
                                      <Select
                                        value={String(placement.afterSectionIndex)}
                                        onValueChange={(v) => updateInteractiveBlock(idx, { afterSectionIndex: parseInt(v) })}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {insightsSections.map((s, si) => (
                                            <SelectItem key={si} value={String(si)}>
                                              Section {si + 1}{s.heading ? `: ${s.heading.slice(0, 30)}` : ""}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Block type</Label>
                                      <Select
                                        value={placement.block.type}
                                        onValueChange={(v) => updateInteractiveBlock(idx, { block: defaultBlockForType(v as InteractiveBlockSpec["type"]) })}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {BLOCK_TYPE_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  {/* Type-specific params */}
                                  {placement.block.type === "calculator" && (
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Variant</Label>
                                      <Select
                                        value={(placement.block as any).variant || "health-factor"}
                                        onValueChange={(v) => updateInteractiveBlock(idx, { block: { ...placement.block, variant: v } as any })}
                                      >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="health-factor">Health Factor</SelectItem>
                                          <SelectItem value="apy-vs-apr">APY vs APR</SelectItem>
                                          <SelectItem value="yield-return">Yield Return</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {placement.block.type === "predict" && (
                                    <div className="space-y-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Question / Prompt</Label>
                                        <Textarea className="text-xs min-h-[60px]" value={(placement.block as any).prompt ?? ""} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, prompt: e.target.value } as any })} />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Options (one per line)</Label>
                                        <Textarea className="text-xs min-h-[60px]" value={Array.isArray((placement.block as any).options) ? (placement.block as any).options.join("\n") : ""} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, options: e.target.value.split("\n") } as any })} />
                                      </div>
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Correct option index (0-based)</Label>
                                          <input type="number" min={0} className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).correctIndex ?? 0} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, correctIndex: parseInt(e.target.value) || 0 } as any })} />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Reveal explanation</Label>
                                        <Textarea className="text-xs min-h-[60px]" value={(placement.block as any).reveal ?? ""} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, reveal: e.target.value } as any })} />
                                      </div>
                                    </div>
                                  )}
                                  {placement.block.type === "checkpoint" && (
                                    <div className="space-y-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Question</Label>
                                        <Textarea className="text-xs min-h-[60px]" value={(placement.block as any).question ?? ""} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, question: e.target.value } as any })} />
                                      </div>
                                      {Array.isArray((placement.block as any).options) && (placement.block as any).options.map((opt: any, oi: number) => (
                                        <div key={oi} className="rounded border border-border/50 p-2 space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-14 shrink-0">Option {oi + 1}</span>
                                            <Input className="h-7 text-xs" value={opt.text ?? ""} onChange={(e) => {
                                              const opts = [...(placement.block as any).options]
                                              opts[oi] = { ...opts[oi], text: e.target.value }
                                              updateInteractiveBlock(idx, { block: { ...placement.block, options: opts } as any })
                                            }} />
                                            <label className="flex items-center gap-1 text-xs shrink-0">
                                              <input type="checkbox" checked={!!opt.correct} onChange={(e) => {
                                                const opts = [...(placement.block as any).options]
                                                opts[oi] = { ...opts[oi], correct: e.target.checked }
                                                updateInteractiveBlock(idx, { block: { ...placement.block, options: opts } as any })
                                              }} /> Correct
                                            </label>
                                          </div>
                                          <Input className="h-7 text-xs" placeholder="Explanation" value={opt.explanation ?? ""} onChange={(e) => {
                                            const opts = [...(placement.block as any).options]
                                            opts[oi] = { ...opts[oi], explanation: e.target.value }
                                            updateInteractiveBlock(idx, { block: { ...placement.block, options: opts } as any })
                                          }} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {placement.block.type === "apy-snowball" && (
                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="space-y-1"><Label className="text-xs">Rate (e.g. 0.12 = 12%)</Label><input type="number" step="0.01" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).rate ?? 0.05} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, rate: parseFloat(e.target.value) || 0.05 } as any })} /></div>
                                      <div className="space-y-1"><Label className="text-xs">Months</Label><input type="number" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).months ?? 12} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, months: parseInt(e.target.value) || 12 } as any })} /></div>
                                    </div>
                                  )}
                                  {placement.block.type === "jenga" && (
                                    <div className="grid gap-2 md:grid-cols-3">
                                      <div className="space-y-1"><Label className="text-xs">Loan amount ($)</Label><input type="number" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).loanAmount ?? 1000} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, loanAmount: parseFloat(e.target.value) || 1000 } as any })} /></div>
                                      <div className="space-y-1"><Label className="text-xs">Liq. LTV (0–1)</Label><input type="number" step="0.01" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).liqLtv ?? 0.8} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, liqLtv: parseFloat(e.target.value) || 0.8 } as any })} /></div>
                                      <div className="space-y-1"><Label className="text-xs">Initial blocks</Label><input type="number" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).initialBlocks ?? 10} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, initialBlocks: parseInt(e.target.value) || 10 } as any })} /></div>
                                    </div>
                                  )}
                                  {placement.block.type === "leverage-seesaw" && (
                                    <div className="space-y-1"><Label className="text-xs">Max leverage (2–10)</Label><input type="number" min={2} max={10} className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).maxLeverage ?? 5} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, maxLeverage: parseFloat(e.target.value) || 5 } as any })} /></div>
                                  )}
                                  {placement.block.type === "rate-highway" && (
                                    <div className="space-y-1"><Label className="text-xs">Kink utilization (0.6–0.9)</Label><input type="number" step="0.01" className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs" value={(placement.block as any).kinkUtilization ?? 0.8} onChange={(e) => updateInteractiveBlock(idx, { block: { ...placement.block, kinkUtilization: parseFloat(e.target.value) || 0.8 } as any })} /></div>
                                  )}
                                </div>
                              ))
                            )}
                          </CardContent>
                        </Card>
                        <div className="space-y-2"><Label>Markdown Preview</Label><Textarea value={displayedInsightsMarkdown} rows={10} className="font-mono text-sm" readOnly /></div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="author" className="quad-tab-content mt-0"><Card className="border-border/70"><CardHeader><CardTitle>Author</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Name</Label><Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} /></div><div><Label>Bio</Label><Textarea value={authorBio} onChange={(e) => setAuthorBio(e.target.value)} rows={3} /></div></CardContent></Card></TabsContent>
              <TabsContent value="images" className="quad-tab-content mt-0">
                <Card className="border-border/70">
                  <CardHeader><CardTitle>Images</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="coverImageUrl">Cover URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="coverImageUrl"
                          value={coverImageUrl}
                          onChange={(e) => setCoverImageUrl(e.target.value)}
                          placeholder="Leave empty to auto-generate a cover"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleImportCoverImageUrl}
                          disabled={importingCoverUrl || !coverImageUrl.trim() || isSelfHostedImageUrl(coverImageUrl)}
                        >
                          {importingCoverUrl ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                          ) : (
                            "Import to CDN"
                          )}
                        </Button>
                      </div>
                      {!isSelfHostedImageUrl(coverImageUrl) && (
                        <p className="text-sm text-amber-500">
                          External image URLs are not rendered by the blog. Click “Import to CDN” to copy the
                          picture onto our own storage. The link must point at the image file itself — a link to a
                          post or gallery page (e.g. an x.com status) will not work.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="coverImageUpload">Upload cover image</Label>
                      <Input
                        id="coverImageUpload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setImageFile(file)
                          setUploadStatus(file ? `${file.name} selected (${(file.size / (1024 * 1024)).toFixed(1)} MB)` : null)
                        }}
                      />
                      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF, AVIF or SVG — up to 8 MB.</p>
                      <Button
                        type="button"
                        onClick={handleUploadCoverImage}
                        disabled={uploadingImage || !imageFile}
                      >
                        {uploadingImage ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                        ) : (
                          "Upload"
                        )}
                      </Button>
                    </div>

                    {uploadStatus && <p className="text-sm text-muted-foreground">{uploadStatus}</p>}

                    {coverImageUrl.trim() && (
                      <div className="space-y-2">
                        <Label>Preview</Label>
                        {/* Plain <img>: shows the real picture even for hosts next/image would reject,
                            so a broken cover is visible here rather than after publishing. */}
                        <img
                          src={coverImageUrl}
                          alt="Cover preview"
                          className="max-h-48 rounded-md border border-border/70 object-contain"
                          onError={() => setUploadStatus("The cover URL could not be loaded as an image.")}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="seo" className="quad-tab-content mt-0"><Card className="border-border/70"><CardHeader><CardTitle>SEO</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Meta Title</Label><Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} /></div><div><Label>Meta Description</Label><Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3} /></div></CardContent></Card></TabsContent>
              <TabsContent value="faq" className="quad-tab-content mt-0"><Card className="border-border/70"><CardHeader><CardTitle>FAQ</CardTitle></CardHeader><CardContent className="space-y-4">{faq.map((f, i) => (<div key={i} className="flex justify-between border-b pb-2"><p>{f.question}</p><Button type="button" variant="ghost" size="sm" onClick={() => removeFAQ(i)}><X className="h-4 w-4" /></Button></div>))}<div className="space-y-2"><Input value={newFaqQuestion} onChange={(e) => setNewFaqQuestion(e.target.value)} placeholder="Question" /><Textarea value={newFaqAnswer} onChange={(e) => setNewFaqAnswer(e.target.value)} placeholder="Answer" /><Button type="button" onClick={addFAQ}>Add FAQ</Button></div></CardContent></Card></TabsContent>
              <TabsContent value="history" className="quad-tab-content mt-0"><Card className="border-border/70"><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent>{versionsLoading ? <Loader2 className="animate-spin" /> : versions.map((v, idx) => (<div key={idx} className="flex justify-between border-b py-2"><div><p>{formatDateTime(v.createdAt)}</p><p className="text-xs">{v.status}</p></div><Button type="button" variant="outline" size="sm" onClick={() => { if (confirm("Restore?")) applyPostToEditor(v) }}>Restore</Button></div>))}</CardContent></Card></TabsContent>
            </Tabs>
            <Button type="submit" disabled={loading} className="w-full md:hidden">{loading ? <Loader2 className="animate-spin" /> : saveActionLabel}</Button>
          </div>
          <div className="space-y-6 lg:col-span-4"><Card className="sticky top-4 border-border/70"><CardHeader><CardTitle>Health</CardTitle></CardHeader><CardContent className="space-y-4">{error && <div className="text-destructive text-sm">{error}</div>}{success && <div className="text-emerald-600 text-sm">{successMessage}</div>}<Button type="submit" disabled={loading} className="w-full">{loading ? <Loader2 className="animate-spin" /> : saveActionLabel}</Button></CardContent></Card></div>
        </form>
      </div>
    </>
  )
}
