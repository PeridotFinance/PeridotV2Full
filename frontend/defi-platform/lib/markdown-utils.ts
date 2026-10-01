/**
 * Parse markdown content and extract headers with their positions
 */
export interface HeaderInfo {
  level: 2 | 3
  text: string
  lineIndex: number
  contentAfter: string // Content between this header and the next header
}

/**
 * Extract all h2 and h3 headers from markdown content
 */
export function extractHeaders(markdown: string): HeaderInfo[] {
  const lines = markdown.split('\n')
  const headers: HeaderInfo[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h2Match = line.match(/^##\s+(.+)$/)
    const h3Match = line.match(/^###\s+(.+)$/)
    
    if (h2Match) {
      const contentAfter = extractContentAfterHeader(lines, i)
      headers.push({
        level: 2,
        text: h2Match[1].trim(),
        lineIndex: i,
        contentAfter,
      })
    } else if (h3Match) {
      const contentAfter = extractContentAfterHeader(lines, i)
      headers.push({
        level: 3,
        text: h3Match[1].trim(),
        lineIndex: i,
        contentAfter,
      })
    }
  }
  
  return headers
}

/**
 * Extract content after a header until the next header of same or higher level
 */
function extractContentAfterHeader(lines: string[], headerIndex: number): string {
  const headerLevel = lines[headerIndex].startsWith('###') ? 3 : 2
  const contentLines: string[] = []
  
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    // Stop at next header of same or higher level
    if (line.match(/^##\s+/) || (headerLevel === 3 && line.match(/^###\s+/))) {
      break
    }
    contentLines.push(line)
  }
  
  return contentLines.join('\n').trim()
}

/**
 * Insert markdown image at a specific line index
 */
export function insertImageAtLine(markdown: string, lineIndex: number, imageUrl: string, altText: string): string {
  const lines = markdown.split('\n')
  const imageMarkdown = `![${altText}](${imageUrl})`
  
  // Insert image after the header (lineIndex + 1)
  // Add some spacing
  lines.splice(lineIndex + 1, 0, '', imageMarkdown, '')
  
  return lines.join('\n')
}

/**
 * Insert explanation marker at a specific line index
 * Format: <!-- EXPLANATION: {explanation text} -->
 */
export function insertExplanationAtLine(markdown: string, lineIndex: number, explanation: string): string {
  const lines = markdown.split('\n')
  const explanationMarker = `<!-- EXPLANATION: ${explanation.replace(/\n/g, ' ')} -->`
  
  // Insert explanation marker after the line
  lines.splice(lineIndex + 1, 0, explanationMarker)
  
  return lines.join('\n')
}

/**
 * Extract explanation markers from markdown
 */
export function extractExplanations(markdown: string): Array<{ lineIndex: number; explanation: string }> {
  const lines = markdown.split('\n')
  const explanations: Array<{ lineIndex: number; explanation: string }> = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/<!--\s*EXPLANATION:\s*(.+?)\s*-->/)
    if (match) {
      explanations.push({
        lineIndex: i,
        explanation: match[1].trim(),
      })
    }
  }
  
  return explanations
}

