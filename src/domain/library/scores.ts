import { displayScoreSchema, scoreUnitsSchema } from './schemas'

export function scoreToUnits(score: unknown): number {
  return displayScoreSchema.parse(score) * 2
}

export function unitsToScore(units: unknown): number {
  return scoreUnitsSchema.parse(units) / 2
}
