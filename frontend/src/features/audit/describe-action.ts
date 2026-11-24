import i18n from '@/i18n'
import { humanize } from '@/i18n/enum-label'

function lookup(key: string, fallback: string): string {
  return i18n.exists(key) ? i18n.t(key as never) : fallback
}

/** "Task.StatusChanged" -> "Task status changed" in the current language. */
export function describeAction(action: string): string {
  const [entity, verb] = action.split('.')
  const fallback = verb ? `${humanize(entity)} ${humanize(verb).toLowerCase()}` : humanize(action)
  return lookup(`audit.actions.${action}`, fallback)
}

/** Audited entity type, e.g. "LeaveRequest" -> "Leave request". */
export function entityLabel(entity: string): string {
  return lookup(`audit.entities.${entity}`, humanize(entity))
}

/** Field name inside audited old/new values, e.g. "FirstName" -> "First name". */
export function fieldLabel(field: string): string {
  return lookup(`audit.fields.${field}`, humanize(field))
}
