import { ZodError } from 'zod'

export type LocalStorageCode =
  | 'unavailable'
  | 'blocked'
  | 'quota_exceeded'
  | 'corrupt_data'
  | 'identity_missing'
  | 'identity_generation_failed'
  | 'constraint'
  | 'aborted'
  | 'version_mismatch'
  | 'unexpected'

export class LocalStorageError extends Error {
  readonly code: LocalStorageCode
  readonly recoverable = true
  constructor(code: LocalStorageCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'LocalStorageError'
    this.code = code
  }
}

export function asLocalStorageError(error: unknown): LocalStorageError {
  if (error instanceof LocalStorageError) return error
  if (error instanceof ZodError) {
    return new LocalStorageError(
      'corrupt_data',
      'Los datos locales no cumplen el esquema esperado.',
      error,
    )
  }
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'MissingAPIError':
    case 'SecurityError':
      return new LocalStorageError(
        'unavailable',
        'IndexedDB no está disponible en este entorno.',
        error,
      )
    case 'QuotaExceededError':
      return new LocalStorageError(
        'quota_exceeded',
        'No hay espacio disponible para guardar los datos.',
        error,
      )
    case 'ConstraintError':
    case 'BulkError':
      return new LocalStorageError(
        'constraint',
        'La escritura incumple una restricción de la base local.',
        error,
      )
    case 'AbortError':
    case 'TransactionInactiveError':
    case 'PrematureCommitError':
    case 'DatabaseClosedError':
      return new LocalStorageError(
        'aborted',
        'La operación local no pudo completarse. Puede reintentarse.',
        error,
      )
    case 'VersionError':
      return new LocalStorageError(
        'version_mismatch',
        'Esta versión de la aplicación no puede abrir el esquema local existente.',
        error,
      )
    default:
      return new LocalStorageError(
        'unexpected',
        'No se pudo completar la operación de almacenamiento local.',
        error,
      )
  }
}
