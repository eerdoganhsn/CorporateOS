import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/common/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminDashboard } from '@/features/dashboard/admin-dashboard'
import { EmployeeDashboard } from '@/features/dashboard/employee-dashboard'
import { ManagerDashboard } from '@/features/dashboard/manager-dashboard'
import { currentLanguage } from '@/i18n'
import { localeTag } from '@/i18n/languages'
import { usePermissions } from '@/store/auth-store'

function greetingKey() {
  const hour = new Date().getHours()
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

/** Role-specific overview; admins and managers can switch to their personal "My work" view. */
export default function DashboardPage() {
  const { t } = useTranslation()
  const { user, isAdmin, isManager } = usePermissions()
  const [params, setParams] = useSearchParams()

  const primaryView = isAdmin ? 'company' : isManager ? 'team' : 'me'
  const view = params.get('view') ?? primaryView
  const firstName = user?.displayName.split(' ')[0]

  const header = (
    <PageHeader
      title={t(`dashboard.greeting.${greetingKey()}`, { name: firstName })}
      description={new Date().toLocaleDateString(localeTag(currentLanguage()), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
    />
  )

  if (primaryView === 'me') {
    return (
      <>
        {header}
        <EmployeeDashboard />
      </>
    )
  }

  return (
    <>
      {header}
      <Tabs value={view} onValueChange={(v) => setParams({ view: v }, { replace: true })}>
        <TabsList>
          {isAdmin && <TabsTrigger value="company">{t('dashboard.tabs.company')}</TabsTrigger>}
          {isManager && <TabsTrigger value="team">{t('dashboard.tabs.team')}</TabsTrigger>}
          <TabsTrigger value="me">{t('dashboard.tabs.me')}</TabsTrigger>
        </TabsList>
        {isAdmin && (
          <TabsContent value="company">
            <AdminDashboard />
          </TabsContent>
        )}
        {isManager && (
          <TabsContent value="team">
            <ManagerDashboard />
          </TabsContent>
        )}
        <TabsContent value="me">
          <EmployeeDashboard />
        </TabsContent>
      </Tabs>
    </>
  )
}
