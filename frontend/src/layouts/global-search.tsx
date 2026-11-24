import { useQuery } from '@tanstack/react-query'
import { Briefcase, FileText, FolderKanban, ListChecks, Megaphone, Search, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { searchApi } from '@/api/endpoints'
import { Spinner } from '@/components/common/states'
import { Input } from '@/components/ui/form-controls'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/overlays'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/utils/cn'

const ICONS = { Employee: User, Project: FolderKanban, Task: ListChecks, Document: FileText, Announcement: Megaphone }

/** Top-bar search across modules. Press "/" to focus; arrow keys + Enter to navigate. */
export function GlobalSearch() {
  const { t, i18n } = useTranslation()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const debounced = useDebounce(term.trim(), 250)

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchApi.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })
  const items = debounced.length >= 2 ? (data?.items ?? []) : []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (url: string) => {
    setOpen(false)
    setTerm('')
    navigate(url)
  }

  return (
    <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, items.length - 1))
              if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
              if (e.key === 'Enter' && items[active]) go(items[active].url)
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={t('common.search.placeholder')}
            className="h-8 bg-muted/40 pr-8 pl-8"
            aria-label={t('common.search.label')}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-background px-1.5 text-[10px] text-muted-foreground sm:block">
            /
          </kbd>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-80 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isFetching && items.length === 0 && (
          <div className="flex justify-center py-6">
            <Spinner className="text-muted-foreground" />
          </div>
        )}
        {!isFetching && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.search.noResults', { term: debounced })}</p>}
        {items.map((item, index) => {
          const Icon = ICONS[item.type as keyof typeof ICONS] ?? Briefcase
          return (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item.url)}
              className={cn('flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left', index === active && 'bg-accent')}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.title}</span>
                {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {i18n.exists(`common.search.types.${item.type}`) ? t(`common.search.types.${item.type}` as never) : item.type}
              </span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
