import { z } from 'zod'

export const PERSONAL_PROJECT_ORDER_CAPABILITY = 'ui.personalProjectOrder.v1'

const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const ProjectPreferenceSchema = z.object({
  pinned: z.boolean().optional(),
  lastOpenedAt: safeInteger.optional(),
  openCount: safeInteger.optional()
})
export type ProjectPreference = z.infer<typeof ProjectPreferenceSchema>

export const PersonalProjectOrderSchema = z.object({
  projects: z.record(z.string(), ProjectPreferenceSchema.catch({})),
  settledOperations: z.array(z.string()).max(4096)
})
export type PersonalProjectOrder = z.infer<typeof PersonalProjectOrderSchema>

export function normalizePersonalProjectOrder(value: unknown): PersonalProjectOrder {
  const parsed = PersonalProjectOrderSchema.safeParse(value)
  return parsed.success ? parsed.data : { projects: {}, settledOperations: [] }
}
