import i18n, { type Messages } from './index'

export type EnumType = keyof Messages['enums']

/** "AnnualLeave" -> "Annual Leave" — last resort for values the catalog does not know. */
export function humanize(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

/** Display name of an API enum value in the current language, e.g. enumLabel('LeaveType', 'SickLeave'). */
export function enumLabel(type: EnumType, value: string | null | undefined): string {
  if (!value) return ''
  const key = `enums.${type}.${value}`
  return i18n.exists(key) ? i18n.t(key as never) : humanize(value)
}
