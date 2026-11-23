import { mediaUrl } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/display'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string | null | undefined
  src?: string | null
  className?: string
}) {
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={mediaUrl(src)} alt={name ?? ''} />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

/** Avatar with name and an optional secondary line, used in tables and lists. */
export function PersonCell({
  name,
  subtitle,
  src,
  className,
}: {
  name: string | null | undefined
  subtitle?: string | null
  src?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <UserAvatar name={name} src={src} className="size-7" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name ?? '—'}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}
