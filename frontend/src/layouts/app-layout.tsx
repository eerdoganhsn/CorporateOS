import { Dialog as DialogPrimitive } from 'radix-ui'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Menu, User } from 'lucide-react'
import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useNavigate } from 'react-router'
import { authApi } from '@/api/endpoints'
import { RoleBadge } from '@/components/common/badges'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { PageSkeleton } from '@/components/common/states'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
} from '@/components/ui/overlays'
import { useAuthStore } from '@/store/auth-store'
import { GlobalSearch } from './global-search'
import { NotificationBell } from './notification-bell'
import { BrandMark, SidebarNav } from './sidebar'

export function AppLayout() {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav />
        </div>
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="left-0 right-auto w-72 border-r border-l-0 p-4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogPrimitive.Title className="sr-only">{t('common.shell.navigation')}</DialogPrimitive.Title>
          <BrandMark className="mb-4" />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('common.shell.openNavigation')}>
            <Menu />
          </Button>
          <div className="flex flex-1 items-center">
            <GlobalSearch />
          </div>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <NotificationBell />
          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function UserMenu() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      clear()
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md p-1 pr-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={t('common.shell.accountMenu')}
        >
          <UserAvatar name={user?.displayName} src={user?.profileImageUrl} className="size-7" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-medium">{user?.displayName}</span>
            <span className="block text-[11px] text-muted-foreground">{user?.positionTitle ?? (user ? t(`enums.Role.${user.primaryRole}`) : '')}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-1">
          <p className="truncate">{user?.displayName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
          {user && <RoleBadge role={user.primaryRole} />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User />
            {t('common.shell.myProfile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile/security">
            <KeyRound />
            {t('common.shell.security')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut />
          {t('common.shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
