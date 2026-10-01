"use client"

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { HELP_CATEGORIES, HELP_CATALOG, type HelpCategoryId } from "@/data/help-catalog"

interface GuideSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (entryKey: string, categoryId: HelpCategoryId) => void
}

const CATEGORY_LABEL = Object.fromEntries(HELP_CATEGORIES.map((c) => [c.id, c.label])) as Record<HelpCategoryId, string>

export function GuideSearch({ open, onOpenChange, onSelect }: GuideSearchProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search for a screen or state…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {HELP_CATEGORIES.map((cat) => {
          const items = HELP_CATALOG.filter((e) => e.category === cat.id)
          if (!items.length) return null
          return (
            <CommandGroup key={cat.id} heading={cat.label}>
              {items.map((entry) => (
                <CommandItem
                  key={entry.key}
                  // value drives cmdk's fuzzy match; include blurb so prose hits too.
                  value={`${entry.title} ${entry.blurb} ${CATEGORY_LABEL[cat.id]}`}
                  onSelect={() => onSelect(entry.key, cat.id)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{entry.title}</span>
                    <span className="line-clamp-1 text-xs text-text/40">{entry.blurb}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
