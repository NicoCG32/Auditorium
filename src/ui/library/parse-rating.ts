import { displayScoreSchema } from '../../domain/library/schemas'

export function parseRating(value: string): number | undefined {
  const text = value.trim()
  if (!/^\d+(?:[.,]\d+)?$/u.test(text)) return undefined
  const parsed = displayScoreSchema.safeParse(Number(text.replace(',', '.')))
  return parsed.success ? parsed.data : undefined
}
