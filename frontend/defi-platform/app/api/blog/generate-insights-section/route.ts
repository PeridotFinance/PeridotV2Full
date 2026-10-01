import { NextRequest, NextResponse } from "next/server"
import { callOpenAI, parseModelJson, type InsightsPath } from "../generate-helpers"
import { assertProtectedBlogWrite } from "../_lib/security"

type SectionInput = {
  heading: string
  sentences: string[]
  callout: string
}

type GenerateSectionBody = {
  title: string
  excerpt?: string
  insightsPath: InsightsPath
  sections: SectionInput[]
  targetSectionIndex: number
}

type GeneratedSection = {
  heading: string
  sentences: string[]
  callout: string
}

function normalizeSection(section: Partial<GeneratedSection>): GeneratedSection {
  const heading = String(section.heading || "").trim()
  const sentences = Array.isArray(section.sentences)
    ? section.sentences
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 4)
    : []
  const callout = String(section.callout || "").trim()
  return {
    heading,
    sentences: sentences.length > 0 ? sentences : [""],
    callout,
  }
}

export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  try {
    const body = (await request.json()) as GenerateSectionBody
    const title = String(body?.title || "").trim()
    const excerpt = String(body?.excerpt || "").trim()
    const sections = Array.isArray(body?.sections) ? body.sections : []
    const targetSectionIndex = Number(body?.targetSectionIndex)
    const insightsPath = body?.insightsPath

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 })
    }
    if (!["starter", "yield", "risk", "market"].includes(String(insightsPath))) {
      return NextResponse.json({ error: "Invalid insights path." }, { status: 400 })
    }
    if (!Number.isInteger(targetSectionIndex) || targetSectionIndex < 0 || targetSectionIndex >= sections.length) {
      return NextResponse.json({ error: "Invalid target section index." }, { status: 400 })
    }

    const compactSections = sections.map((section, index) => ({
      index,
      heading: String(section?.heading || "").trim(),
      sentences: Array.isArray(section?.sentences)
        ? section.sentences.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4)
        : [],
      callout: String(section?.callout || "").trim(),
    }))

    const systemPrompt = `You generate one Insights article section for Peridot. Keep writing very clear and short. Return valid JSON only.`
    const userPrompt = `
Generate a replacement for ONE target section inside an Insights article.

Article context:
- Title: ${title}
- Excerpt: ${excerpt || "(none)"}
- Path: ${insightsPath}
- Target section index: ${targetSectionIndex}

Current sections:
${JSON.stringify(compactSections, null, 2)}

Requirements:
- Return ONLY the updated target section.
- Keep every sentence concise but meaningful (target 70-160 chars).
- 2 to 4 sentences in "sentences".
- "heading" should be concise and practical.
- "callout" should be one short reminder line.
- Keep style educational and direct.
- Keep it aligned with the path and surrounding sections.
- Each sentence should include a clear purpose:
  - explain why this matters, or
  - tell the user exactly what to do, or
  - describe the expected outcome.
- Prefer action-oriented wording with specific verbs:
  check, set, compare, review, execute, monitor, document.
- Avoid vague filler lines that do not guide action.
- Mention Peridot only when directly relevant to cross-chain lending/borrowing or margin trading.

Return JSON:
{
  "heading": "string",
  "sentences": ["string", "string"],
  "callout": "string"
}
`

    const output = await callOpenAI(systemPrompt, userPrompt)
    const parsed = parseModelJson<GeneratedSection>(output)
    const section = normalizeSection(parsed)

    return NextResponse.json({ section })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate section."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
