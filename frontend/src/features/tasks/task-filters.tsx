import { Columns3, List, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { FilterSelect, SearchInput } from '@/components/common/filters'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label } from '@/components/ui/form-controls'
import { useEmployeeLookup, useProjectLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { PRIORITIES, TASK_STATUSES } from '@/types/enums'
import { cn } from '@/utils/cn'
import type { TaskTableState } from './task-query'

export function TaskViewSwitcher({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation()
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium', isActive ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md border bg-muted/50 p-0.5">
        <NavLink to="/tasks" end className={linkClass}>
          <List className="size-4" /> {t('tasks.views.list')}
        </NavLink>
        <NavLink to="/tasks/board" className={linkClass}>
          <Columns3 className="size-4" /> {t('tasks.views.board')}
        </NavLink>
      </div>
      {onCreate && (
        <Button onClick={onCreate}>
          <Plus />
          {t('tasks.views.create')}
        </Button>
      )}
    </div>
  )
}

export function TaskFilterControls({ table, hideStatus }: { table: TaskTableState; hideStatus?: boolean }) {
  const { t } = useTranslation()
  const { isManagerOrAbove } = usePermissions()
  const projects = useProjectLookup()
  const employees = useEmployeeLookup()

  return (
    <>
      <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('tasks.filters.search')} />
      <FilterSelect
        label={t('tasks.filters.allProjects')}
        value={table.filters.projectId}
        onChange={(v) => table.setFilter('projectId', v)}
        options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.projectCode} — ${p.name}` }))}
      />
      {isManagerOrAbove && (
        <FilterSelect
          label={t('tasks.filters.allAssignees')}
          value={table.filters.assignedToId}
          onChange={(v) => table.setFilter('assignedToId', v)}
          options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
        />
      )}
      {!hideStatus && (
        <FilterSelect
          label={t('tasks.filters.allStatuses')}
          value={table.filters.status}
          onChange={(v) => table.setFilter('status', v)}
          options={TASK_STATUSES}
          enumType="TaskStatus"
        />
      )}
      <FilterSelect
        label={t('tasks.filters.allPriorities')}
        value={table.filters.priority}
        onChange={(v) => table.setFilter('priority', v)}
        options={PRIORITIES}
        enumType="Priority"
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label={t('tasks.filters.dueFrom')}
          title={t('tasks.filters.dueFrom')}
          value={table.filters.dueFrom ?? ''}
          onChange={(e) => table.setFilter('dueFrom', e.target.value || undefined)}
          className="w-full sm:w-36"
        />
        <span className="text-xs text-muted-foreground">{t('tasks.filters.to')}</span>
        <Input
          type="date"
          aria-label={t('tasks.filters.dueTo')}
          title={t('tasks.filters.dueTo')}
          value={table.filters.dueTo ?? ''}
          onChange={(e) => table.setFilter('dueTo', e.target.value || undefined)}
          className="w-full sm:w-36"
        />
      </div>
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-2">
          <Checkbox id="mine" checked={table.filters.mine === 'true'} onCheckedChange={(c) => table.setFilter('mine', c === true ? 'true' : undefined)} />
          <Label htmlFor="mine" className="font-normal">
            {t('tasks.filters.mine')}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="overdueOnly"
            checked={table.filters.overdueOnly === 'true'}
            onCheckedChange={(c) => table.setFilter('overdueOnly', c === true ? 'true' : undefined)}
          />
          <Label htmlFor="overdueOnly" className="font-normal">
            {t('tasks.filters.overdueOnly')}
          </Label>
        </div>
      </div>
    </>
  )
}
