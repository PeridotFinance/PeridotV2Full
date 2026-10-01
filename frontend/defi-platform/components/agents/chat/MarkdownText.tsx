'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownTextProps {
  content: string
  /**
   * `whisper` — short, container-less text styled to sit next to Perry's
   * avatar (slightly larger, looser line height).
   * `note` — text inside a soft card (slightly smaller, denser).
   * Both share the same markdown grammar; only base type sizing differs.
   */
  variant?: 'whisper' | 'note'
  className?: string
}

export function MarkdownText({
  content,
  variant = 'note',
  className,
}: MarkdownTextProps) {
  const base =
    variant === 'whisper'
      ? 'text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed'
      : 'text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed'

  return (
    <div className={cn(base, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[15px] font-bold text-slate-900 dark:text-white mt-3 mb-1.5 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white mt-3 mb-1 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mt-2 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-slate-300 dark:marker:text-slate-600">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 space-y-0.5 list-decimal marker:text-slate-400 dark:marker:text-slate-500">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
            >
              {children}
            </a>
          ),
          code: ({ children, className: codeClass }) => {
            const isBlock = codeClass?.includes('language-')
            if (isBlock) {
              return (
                <code className="block my-2 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/[0.06] dark:border-white/10 text-[13px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre">
                  {children}
                </code>
              )
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[13px] font-mono text-slate-800 dark:text-slate-200">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <div className="my-2">{children}</div>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-emerald-500/40 text-slate-500 dark:text-slate-400 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-black/[0.06] dark:border-white/10" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/10">
              <table className="w-full text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 dark:bg-white/5">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-t border-black/[0.06] dark:border-white/10 text-slate-700 dark:text-slate-300">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
