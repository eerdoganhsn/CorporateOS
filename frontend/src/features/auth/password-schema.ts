import { z } from 'zod'

/**
 * Mirrors the default server password policy for instant feedback. The server remains the
 * authority (SuperAdmins can tighten the policy in Settings → Security). Messages are translation
 * keys; FormField renders them in the current language.
 */
export const passwordSchema = z
  .string()
  .min(8, 'common.validation.password.min')
  .max(128, 'common.validation.password.max')
  .regex(/[A-Z]/, 'common.validation.password.upper')
  .regex(/[0-9]/, 'common.validation.password.digit')
  .regex(/[^A-Za-z0-9]/, 'common.validation.password.symbol')
