import { z } from 'zod'

/** Optional numeric text input ("" allowed) validated as a non-negative number. */
export const optionalAmount = (message = 'common.validation.number') =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), message)

/** Required select bound to a numeric id. */
export const requiredId = (message: string) => z.string().min(1, message)

export function toOptionalNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value.trim() === '') return null
  return Number(value)
}

export function toNullable(value: string | undefined | null): string | null {
  return value === undefined || value === null || value.trim() === '' ? null : value.trim()
}
