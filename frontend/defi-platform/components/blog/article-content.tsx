"use client"

import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { ExplanationButton } from "./explanation-button"

interface ArticleContentProps {
  html: string
}

export function ArticleContent({ html }: ArticleContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [explanations, setExplanations] = useState<Array<{ id: string; text: string; element: HTMLElement }>>([])
  const [htmlSet, setHtmlSet] = useState(false)

  // Set HTML and mark as set
  useEffect(() => {
    if (contentRef.current && !htmlSet) {
      contentRef.current.innerHTML = html
      setHtmlSet(true)
      console.log('[ArticleContent] HTML set, length:', html.length)
    }
  }, [html, htmlSet])

  useEffect(() => {
    if (!contentRef.current || !htmlSet) {
      console.log('[ArticleContent] Waiting for HTML to be set')
      return
    }

    // Use requestAnimationFrame to ensure DOM is fully updated
    const frameId = requestAnimationFrame(() => {
      // Find all explanation placeholders
      const explanationDivs = contentRef.current?.querySelectorAll('[data-explanation]')
      console.log('[ArticleContent] Found explanation divs:', explanationDivs?.length || 0)
      
      // Also log the actual HTML to debug
      if (explanationDivs && explanationDivs.length === 0) {
        console.warn('[ArticleContent] No explanation divs found. Checking HTML...')
        const htmlContent = contentRef.current?.innerHTML || ''
        const hasDataExplanation = htmlContent.includes('data-explanation')
        console.log('[ArticleContent] HTML contains data-explanation:', hasDataExplanation)
        if (hasDataExplanation) {
          console.log('[ArticleContent] Sample HTML:', htmlContent.slice(0, 500))
        }
      }
      
      if (!explanationDivs || explanationDivs.length === 0) {
        return
      }

      const foundExplanations: Array<{ id: string; text: string; element: HTMLElement }> = []

      explanationDivs.forEach((div, index) => {
        const explanationText = div.getAttribute('data-explanation-text')
        const explanationId = div.getAttribute('data-explanation')
        
        console.log(`[ArticleContent] Processing div ${index}:`, { explanationId, hasText: !!explanationText })
        
        if (!explanationText || !explanationId) {
          console.warn(`[ArticleContent] Missing data for div ${index}`)
          return
        }

        // Decode HTML entities in the explanation text
        const decodedText = explanationText
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')

        foundExplanations.push({
          id: explanationId,
          text: decodedText,
          element: div as HTMLElement,
        })
      })

      console.log('[ArticleContent] Setting explanations:', foundExplanations.length)
      setExplanations(foundExplanations)
    })

    return () => cancelAnimationFrame(frameId)
  }, [html, htmlSet])

  useEffect(() => {
    if (!contentRef.current || explanations.length === 0) {
      console.log('[ArticleContent] Skipping render - no explanations or no ref')
      return
    }

    console.log('[ArticleContent] Rendering', explanations.length, 'explanation(s)')

    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      explanations.forEach(({ id, text, element }, index) => {
        // Check if element still exists and hasn't been replaced
        if (!element.parentNode || !contentRef.current?.contains(element)) {
          console.warn(`[ArticleContent] Element ${index} no longer in DOM`)
          return
        }

        console.log(`[ArticleContent] Rendering explanation ${index} at element:`, element)

        // Create container for React component
        const container = document.createElement('div')
        container.className = 'explanation-react-container'
        
        // Replace the placeholder div with our container
        try {
          element.parentNode.replaceChild(container, element)
          
          // Render React component
          const root = createRoot(container)
          root.render(<ExplanationButton explanation={text} />)
          console.log(`[ArticleContent] Successfully rendered explanation ${index}`)
        } catch (error) {
          console.error(`[ArticleContent] Error rendering explanation ${index}:`, error)
        }
      })
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [explanations])

  return <div ref={contentRef} />
}

