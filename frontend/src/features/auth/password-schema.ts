import { z } from 'zod'

/**
 * Mirrors the default server password policy for instant feedback. The server remains the
 * authority (SuperAdmins can tighten the policy in Settings → Security).
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a digit.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol.')
