"use client"

import { useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type Provider = "chatgpt" | "perplexity" | "claude"

interface AskWithAIProps {
	title: string
	slug: string
	markdownContent: string
	excerpt?: string
}

function stripMarkdown(markdown: string): string {
	let text = markdown
	// Remove fenced code blocks
	text = text.replace(/```[\s\S]*?```/g, " ")
	// Remove inline code
	text = text.replace(/`([^`]+)`/g, "$1")
	// Replace images with alt text
	text = text.replace(/!\[[^\]]*\]\([^\)]*\)/g, " ")
	// Replace links with their text
	text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, "$1")
	// Remove headings markup
	text = text.replace(/^#+\s+/gm, "")
	// Remove bold/italic markers
	text = text.replace(/[\*_]{1,3}([^\*_]+)[\*_]{1,3}/g, "$1")
	// Collapse whitespace
	text = text.replace(/\s+/g, " ").trim()
	return text
}

function buildPrompt(params: { title: string; slug: string; content: string }): string {
	const url = `https://peridot.finance/blog/${params.slug}`
	return [
		"Website: peridot.finance",
		`Article title: ${params.title}`,
		`Canonical URL: ${url}`,
		"Task: You will receive the complete Peridot blog article below. Answer my questions about its full content. Prefer quoting and citing relevant lines. If your tools can fetch the URL, you may cross-check facts, but prioritize the pasted content.",
		"--- BEGIN FULL ARTICLE ---",
		params.content,
		"--- END FULL ARTICLE ---",
	].join("\n")
}

function buildShortPrefill(title: string, slug: string): string {
	const url = `https://peridot.finance/blog/${slug}`
	return `Please research and analyze this page: \"${title}\" at ${url} using web browsing/search. I can ask you questions about it. Once you have read it, prompt me with any questions I have. Do not post content from the page in your response. Any of my follow up questions must reference the site I gave you.`
}

function providerUrl(provider: Provider, prompt: string, title: string, slug: string): string | null {
	const encoded = encodeURIComponent(prompt)
	// Conservative URL length guard
	const MAX_URL_LEN = 1900
	switch (provider) {
		case "perplexity": {
			// Try with full prompt; if too long, fall back to concise query that still uses /search?q=
			const fullUrl = `https://www.perplexity.ai/search?q=${encoded}`
			if (fullUrl.length <= MAX_URL_LEN) return fullUrl
			const shortPrefill = buildShortPrefill(title, slug)
			const shortUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(shortPrefill)}`
			if (shortUrl.length <= MAX_URL_LEN) return shortUrl
			// Guaranteed minimal fallback keeps the search parameter
			const minimal = `https://peridot.finance/blog/${slug}`
			return `https://www.perplexity.ai/search?q=${encodeURIComponent(minimal)}`
		}
		case "claude": {
			// Prefer q= which pre-fills the input; include full prompt if it fits
			const fullUrl = `https://claude.ai/new?q=${encoded}`
			if (fullUrl.length <= MAX_URL_LEN) return fullUrl
			const shortPrefill = buildShortPrefill(title, slug)
			const shortUrl = `https://claude.ai/new?q=${encodeURIComponent(shortPrefill)}`
			return shortUrl.length <= MAX_URL_LEN ? shortUrl : `https://claude.ai/new`
		}
		case "chatgpt": {
			// Try to prefill full prompt with web-search hint; otherwise use a concise prefill
			const fullUrl = `https://chatgpt.com/?hints=search&prompt=${encoded}`
			if (fullUrl.length <= MAX_URL_LEN) return fullUrl
			const shortPrefill = buildShortPrefill(title, slug)
			const shortUrl = `https://chatgpt.com/?hints=search&prompt=${encodeURIComponent(shortPrefill)}`
			return shortUrl.length <= MAX_URL_LEN ? shortUrl : "https://chatgpt.com/"
		}
		default:
			return null
	}
}

export default function AskWithAI({ title, slug, markdownContent, excerpt }: AskWithAIProps) {
	const plain = useMemo(() => stripMarkdown(markdownContent), [markdownContent])
	const fullPrompt = useMemo(() => buildPrompt({ title, slug, content: plain }), [title, slug, plain])

	const openWith = useCallback(async (p: Provider) => {
		let copied = false
		try {
			await navigator.clipboard?.writeText(fullPrompt)
			copied = true
		} catch {}
		const url = providerUrl(p, fullPrompt, title, slug)
		if (url) window.open(url, "_blank", "noopener,noreferrer")
		const providerName = p === "chatgpt" ? "ChatGPT" : p === "perplexity" ? "Perplexity" : "Claude"
		toast(`Opening ${providerName}` , {
			description: copied ? "Prompt copied to clipboard. If needed, paste it in the chat." : "Could not copy prompt automatically. Please paste the prompt manually.",
		})
	}, [fullPrompt, title, slug])

	return (
		<div className="mb-8">
			<div className="flex items-center gap-2 mb-4">
				<span className="text-xl">🤖</span>
				<h3 className="text-xl font-semibold">Explore this content with AI</h3>
			</div>
			<p className="text-sm text-text/70 mb-4">Ask questions about this article using your favorite AI assistant. We copy the prompt for you and open a new tab.</p>
			<div className="flex flex-wrap gap-3">
				<Button
					onClick={() => openWith("chatgpt")}
					variant="outline"
					className="rounded-full px-5 border-[#5e7945] text-foreground bg-background hover:bg-background/80 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm hover:shadow focus-visible:ring-2 focus-visible:ring-[#5e7945]/50"
				>
					ChatGPT
				</Button>
				<Button
					onClick={() => openWith("perplexity")}
					variant="outline"
					className="rounded-full px-5 border-[#5e7945] text-foreground bg-background hover:bg-background/80 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm hover:shadow focus-visible:ring-2 focus-visible:ring-[#5e7945]/50"
				>
					Perplexity
				</Button>
				<Button
					onClick={() => openWith("claude")}
					variant="outline"
					className="rounded-full px-5 border-[#5e7945] text-foreground bg-background hover:bg-background/80 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm hover:shadow focus-visible:ring-2 focus-visible:ring-[#5e7945]/50"
				>
					Claude
				</Button>
				<Button
					onClick={async () => {
						let copied = false
						try {
							await navigator.clipboard?.writeText(fullPrompt)
							copied = true
						} catch {}
						toast(copied ? "Copied full article" : "Copy failed", {
							description: copied ? "Full article prompt (with URL) copied to clipboard." : "Please copy the content manually.",
						})
					}}
					variant="outline"
					className="rounded-full px-5 border-[#5e7945] text-foreground bg-background hover:bg-background/80 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm hover:shadow focus-visible:ring-2 focus-visible:ring-[#5e7945]/50"
				>
					Copy Page
				</Button>
			</div>
		</div>
	)
}


