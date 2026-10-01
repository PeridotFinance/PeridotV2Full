"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { TableOfContentsItem } from "@/types/blog"

interface MobileTableOfContentsProps {
  items: TableOfContentsItem[]
}

export default function MobileTableOfContents({ items }: MobileTableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mb-6 lg:hidden">
      <Card className="bg-card border-border/50 overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-6 flex items-center justify-between hover:bg-muted/30 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-t-lg"
          aria-expanded={isOpen}
          aria-label="Toggle table of contents"
        >
          <h3 className="text-lg font-bold">Table of Contents</h3>
          <ChevronDown
            className={`h-5 w-5 text-text/60 transition-transform duration-300 ease-out ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          className={`overflow-hidden transition-all duration-500 ease-out ${
            isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
          }`}
          style={{
            transitionProperty: "max-height, opacity",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <CardContent
            className={`p-6 pt-0 transition-transform duration-500 ease-out ${
              isOpen ? "translate-y-0" : "-translate-y-4"
            }`}
            style={{
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <nav>
              <ul className="space-y-2 text-sm">
                {items.map((item: TableOfContentsItem, index: number) => {
                  // Different styling based on heading level
                  const isLevel2 = item.level === 2
                  const borderWidth = isLevel2 ? "3px" : "2px"
                  const borderOpacity = isLevel2 ? "0.8" : "0.5"
                  // Level 2 uses primary color, Level 3 uses primary with reduced opacity
                  const textColor = isLevel2 
                    ? "text-primary" 
                    : "text-primary/70 dark:text-primary/60"
                  const fontWeight = isLevel2 ? "font-semibold" : "font-medium"
                  
                  return (
                    <li
                      key={item.slug}
                      style={{
                        marginLeft: `${(item.level - 2) * 12}px`,
                        transitionDelay: isOpen ? `${index * 30}ms` : "0ms",
                        borderLeft: `${borderWidth} solid hsl(var(--primary) / ${borderOpacity})`,
                        paddingLeft: "12px",
                      }}
                      className={`transition-all duration-300 ease-out ${
                        isOpen
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-2"
                      }`}
                    >
                      <a
                        href={`#${item.slug}`}
                        className={`${textColor} ${fontWeight} hover:text-primary hover:underline transition-colors duration-200 block`}
                        onClick={() => setIsOpen(false)}
                      >
                        {item.title}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </CardContent>
        </div>
      </Card>
    </div>
  )
}

