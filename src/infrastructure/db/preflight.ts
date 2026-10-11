import { AuditoriumDatabase, DATABASE_VERSION } from './database'
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
        if (native.version === DATABASE_VERSION * 10) {
          const names = Array.from(native.objectStoreNames).sort()
          const expected = database.tables.map((table) => table.name).sort()
          if (JSON.stringify(names) !== JSON.stringify(expected)) {
            throw new LocalStorageError(
              'corrupt_data',
              'Las tablas locales no coinciden con el esquema declarado.',
            )
          }
          const transaction = native.transaction(names, 'readonly')
          for (const table of database.tables) {
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
            if (store.indexNames.length !== indices.length) {
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
        native.close()
        resolve()
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
