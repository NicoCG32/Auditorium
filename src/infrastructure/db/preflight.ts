import Dexie from 'dexie'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  SCHEMA_V8,
  SCHEMA_V9,
  SCHEMA_V10,
  SCHEMA_V11,
} from './database'
import { LocalStorageError } from './errors'

export function checkNativeSchema(
  database: AuditoriumDatabase,
  onBlocked: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!database.nativeFactory) {
      reject(
        new LocalStorageError(
          'unavailable',
          'IndexedDB no está disponible en este entorno.',
        ),
      )
      return
    }
    const request = database.nativeFactory.open(database.name)
    let initialCreation = false
    request.onblocked = onBlocked
    request.onupgradeneeded = () => {
      initialCreation = true
      // La creación real y sus tablas corresponden a la versión declarada en Dexie.
      request.transaction?.abort()
    }
    request.onerror = (event) => {
      event.preventDefault()
      if (initialCreation && request.error?.name === 'AbortError') resolve()
      else
        reject(
          request.error ??
            new LocalStorageError(
              'unexpected',
              'No se pudo comprobar el esquema local.',
            ),
        )
    }
    request.onsuccess = () => {
      const native = request.result
      try {
        if (native.version > DATABASE_VERSION * 10) {
          throw new LocalStorageError(
            'version_mismatch',
            'La base local usa un esquema más reciente que esta aplicación.',
          )
        }
        const schemas: Record<number, Record<string, string>> = {
          10: SCHEMA_V1,
          20: SCHEMA_V2,
          30: SCHEMA_V3,
          40: SCHEMA_V4,
          50: SCHEMA_V5,
          60: SCHEMA_V6,
          70: SCHEMA_V7,
          80: SCHEMA_V8,
          90: SCHEMA_V9,
          100: SCHEMA_V10,
          110: SCHEMA_V11,
        }
        const schema = schemas[native.version]
        if (!schema)
          throw new LocalStorageError(
            'version_mismatch',
            'La versión de la base no tiene una migración compatible.',
          )
        {
          // Inspect the declared historical version, including indexes replaced in v8.
          const declared = new Dexie(database.name, {
            indexedDB: database.nativeFactory!,
          })
          declared.version(1).stores(schema)
          const tables = declared.tables
          const names = Array.from(native.objectStoreNames).sort()
          const expected = tables.map((table) => table.name).sort()
          if (JSON.stringify(names) !== JSON.stringify(expected)) {
            throw new LocalStorageError(
              'corrupt_data',
              'Las tablas locales no coinciden con el esquema declarado.',
            )
          }
          const transaction = native.transaction(names, 'readonly')
          // Terminar la inspección antes de abrir otra conexión para migrar.
          transaction.oncomplete = () => {
            native.close()
            resolve()
          }
          transaction.onabort = transaction.onerror = () => {
            native.close()
            reject(
              transaction.error ??
                new LocalStorageError(
                  'aborted',
                  'No se pudo completar la comprobación del esquema local.',
                ),
            )
          }
          for (const table of tables) {
            const store = transaction.objectStore(table.name)
            if (
              JSON.stringify(store.keyPath) !==
                JSON.stringify(table.schema.primKey.keyPath) ||
              store.autoIncrement !== Boolean(table.schema.primKey.auto)
            ) {
              throw new LocalStorageError(
                'corrupt_data',
                'La clave de una tabla local no coincide con el esquema declarado.',
              )
            }
            const indices = table.schema.indexes
            if (
              JSON.stringify(Array.from(store.indexNames).sort()) !==
              JSON.stringify(indices.map((spec) => spec.name).sort())
            ) {
              throw new LocalStorageError(
                'corrupt_data',
                'Los índices locales no coinciden con el esquema declarado.',
              )
            }
            for (const spec of indices) {
              const index = store.index(spec.name)
              if (
                JSON.stringify(index.keyPath) !==
                  JSON.stringify(spec.keyPath) ||
                index.unique !== Boolean(spec.unique) ||
                index.multiEntry !== Boolean(spec.multi)
              ) {
                throw new LocalStorageError(
                  'corrupt_data',
                  'Un índice local no coincide con el esquema declarado.',
                )
              }
            }
          }
        }
      } catch (error) {
        native.close()
        reject(
          error instanceof Error
            ? error
            : new LocalStorageError(
                'unexpected',
                'No se pudo comprobar el esquema local.',
                error,
              ),
        )
      }
    }
  })
}
