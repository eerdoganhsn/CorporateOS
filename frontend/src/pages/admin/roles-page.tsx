import { useQuery } from '@tanstack/react-query'
import { Check, Minus, Users } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { adminUsersApi } from '@/api/endpoints'
import { RoleBadge } from '@/components/common/badges'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/display'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROLES } from '@/types/enums'

export default function RolesPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'roles'], queryFn: adminUsersApi.roles })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const areas = [...new Set(data.permissions.map((p) => p.area))]

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Four built-in roles. Permissions are enforced by API policies and service checks; assign roles from the Users page."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.roles.map((role) => (
          <Card key={role.name}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>
                <RoleBadge role={role.name} />
              </CardTitle>
              <Link to={`/admin/users?role=${role.name}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Users className="size-3.5" />
                {role.activeUserCount}/{role.userCount}
              </Link>
            </CardHeader>
            <CardContent className="pt-3 text-sm text-muted-foreground">{role.description}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">Permission</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">
                    {r}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((area) => (
                <Fragment key={area}>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={ROLES.length + 1} className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {area}
                    </TableCell>
                  </TableRow>
                  {data.permissions
                    .filter((p) => p.area === area)
                    .map((p) => (
                      <TableRow key={`${area}-${p.permission}`}>
                        <TableCell>{p.permission}</TableCell>
                        {ROLES.map((r) => (
                          <TableCell key={r} className="text-center">
                            {p.roles.includes(r) ? (
                              <Check className="mx-auto size-4 text-emerald-600" aria-label="Allowed" />
                            ) : (
                              <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not allowed" />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
