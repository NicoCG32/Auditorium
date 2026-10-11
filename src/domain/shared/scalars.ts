import { z } from 'zod'

export const entityIdSchema = z.uuid().transform((value) => value.toLowerCase())

export const utcTimestampSchema = z.iso
  .datetime({ precision: 3 })
  .refine((value) => {
    const milliseconds = Date.parse(value)
    return (
      Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    )
  }, 'La fecha debe ser válida, UTC y con precisión de milisegundos.')
