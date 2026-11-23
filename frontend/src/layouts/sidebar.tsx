import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { API_URL } from '@/api/client'
import { settingsApi } from '@/api/endpoints'
import { usePermissions } from '@/store/auth-store'
import { cn } from '@/utils/cn'
import { NAVIGATION } from './navigation'

export function BrandMark({ className }: { className?: string }) {
  const { data } = useQuery({ queryKey: ['settings', 'public'], queryFn: settingsApi.public, staleTime: 10 * 60 * 1000 })

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {data?.hasLogo ? (
        <img src={`${API_URL}/settings/logo`} alt="" className="size-7 rounded-md object-contain" />
      ) : (
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <svg viewBox="0 0 32 32" className="size-4" aria-hidden="true">
            <path d="M9 11.5h9.5M9 16h14M9 20.5h11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">CorporateOS</p>
        <p className="truncate text-[11px] text-muted-foreground">{data?.companyName ?? 'Enterprise Platform'}</p>
      </div>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasAny } = usePermissions()

  return (
    <nav aria-label="Main navigation" className="space-y-5">
      {NAVIGATION.map((section, index) => {
        const items = section.items.filter((item) => !item.roles || hasAny(item.roles))
        if (items.length === 0) return null

        return (
          <div key={section.label ?? index}>
            {section.label && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-sidebar-accent font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
