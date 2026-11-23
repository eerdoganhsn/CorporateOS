import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/form-controls'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/utils/cn'
import { humanize } from '@/utils/format'

export function FilterBar({ children, onReset, showReset }: { children: ReactNode; onReset?: () => void; showReset?: boolean }) {
  return (
    <div className="no-print flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
      {showReset && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="sm:ml-auto">
          <X />
          Clear filters
        </Button>
      )}
    </div>
  )
}

/** Search box that debounces input before updating the (URL-backed) query. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value)
  const [syncedValue, setSyncedValue] = useState(value)
  const onChangeRef = useRef(onChange)
  const debounced = useDebounce(text, 350)

  // External changes (e.g. "Clear filters") replace the local text — adjusted during render, not in an effect.
  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value)
  }

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    // Only publish once typing has settled, so a stale debounced value never overwrites a reset.
    if (debounced === text && debounced !== syncedValue) onChangeRef.current(debounced)
  }, [debounced, text, syncedValue])

  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        aria-label={placeholder}
      />
    </div>
  )
}

export function FilterSelect<T extends string | number>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: readonly (T | { value: T; label: string })[]
  className?: string
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={cn('w-full sm:w-auto sm:min-w-40', className)}
    >
      <option value="">{label}</option>
      {options.map((option) => {
        const item = typeof option === 'object' ? option : { value: option, label: humanize(String(option)) }
        return (
          <option key={String(item.value)} value={String(item.value)}>
            {item.label}
          </option>
        )
      })}
    </NativeSelect>
  )
}
