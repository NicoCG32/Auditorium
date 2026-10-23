const databaseName = 'auditorium-audio-01-evaluation'
const directoryName = 'auditorium-audio-01-evaluation'
const fileName = 'synthetic-sample.bin'
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('samples')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function writeIdb(
  blob,
  simulateQuota = false,
  representation = 'blob',
  key = `sample-${representation}`,
) {
  const db = await database()
  try {
    const value =
      representation === 'bytes'
        ? new Uint8Array(await blob.arrayBuffer())
        : blob
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('samples', 'readwrite')
      let requestError
      const failure = () =>
        reject(
          simulateQuota
            ? new DOMException('Fallo de cuota simulado.', 'QuotaExceededError')
            : requestError ||
                transaction.error ||
                new DOMException('Transacción abortada.', 'AbortError'),
        )
      transaction.oncomplete = resolve
      transaction.onerror = failure
      transaction.onabort = failure
      const request = transaction.objectStore('samples').put(value, key)
      request.onerror = () => {
        requestError = request.error
      }
      if (simulateQuota) transaction.abort()
    })
  } finally {
    db.close()
  }
}
export async function readIdb(
  representation = 'blob',
  key = `sample-${representation}`,
) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('samples', 'readonly')
        .objectStore('samples')
        .get(key)
      request.onsuccess = () =>
        resolve(
          request.result === undefined ? undefined : new Blob([request.result]),
        )
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
async function directory() {
  if (!navigator.storage?.getDirectory)
    throw new Error('OPFS no está disponible.')
  return (await navigator.storage.getDirectory()).getDirectoryHandle(
    directoryName,
    { create: true },
  )
}
export async function writeOpfs(blob, simulateQuota = false) {
  const file = await (
    await directory()
  ).getFileHandle(fileName, { create: true })
  if (!file.createWritable)
    throw new Error('OPFS no ofrece escritura asíncrona en este motor.')
  const stream = await file.createWritable()
  try {
    await stream.write(blob)
    if (simulateQuota)
      throw new DOMException('Fallo de cuota simulado.', 'QuotaExceededError')
    await stream.close()
  } catch (error) {
    await stream.abort().catch(() => {})
    throw error
  }
}
export async function readOpfs() {
  try {
    return await (await (await directory()).getFileHandle(fileName)).getFile()
  } catch (error) {
    if (error.name === 'NotFoundError') return undefined
    throw error
  }
}
export async function digest(blob) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}
export async function benchmark() {
  const capabilities = {
    secure: isSecureContext,
    estimate: navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null,
    persisted: navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : null,
    opfs: Boolean(navigator.storage?.getDirectory),
  }
  const rows = []
  for (const size of [1024 * 1024, 16 * 1024 * 1024]) {
    const bytes = new Uint8Array(size)
    for (let index = 0; index < size; index++)
      bytes[index] = (index * 17 + 31) % 251
    const blob = new Blob([bytes]),
      expected = await digest(blob)
    for (const [backend, write, read] of [
      ['indexeddb-blob', writeIdb, readIdb],
      [
        'indexeddb-bytes',
        (value, abort) => writeIdb(value, abort, 'bytes'),
        () => readIdb('bytes'),
      ],
      ['opfs', writeOpfs, readOpfs],
    ]) {
      const row = { backend, size }
      rows.push(row)
      try {
        const start = performance.now()
        await write(blob)
        row.writeMs = performance.now() - start
        const reading = performance.now(),
          copy = await read()
        row.readMs = performance.now() - reading
        row.matches = copy.size === size && (await digest(copy)) === expected
        row.sha256 = expected
        try {
          await write(new Blob(['replacement']), true)
          row.quotaSimulation = 'unexpected-success'
        } catch (error) {
          row.quotaSimulation = error.name
        }
        const retained = await read()
        row.retainedAfterAbort =
          retained.size === size && (await digest(retained)) === expected
      } catch (error) {
        row.error = `${error.name}: ${error.message}`
      }
    }
  }
  return {
    capabilities,
    rows,
    after: navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null,
  }
}
export async function storedSummary() {
  const result = {}
  for (const [name, read] of [
    ['indexeddb-blob', readIdb],
    ['indexeddb-bytes', () => readIdb('bytes')],
    ['opfs', readOpfs],
  ]) {
    try {
      const blob = await read()
      result[name] = blob
        ? { size: blob.size, sha256: await digest(blob) }
        : null
    } catch (error) {
      result[name] = { error: error.message }
    }
  }
  return result
}
export async function clearEvaluationStorage() {
  const result = { indexeddb: false, opfs: false }
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('Cierra la otra pestaña del laboratorio.'))
  })
  result.indexeddb = true
  if (navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(directoryName, { recursive: true })
      result.opfs = true
    } catch (error) {
      if (error.name === 'NotFoundError') result.opfs = true
      else result.opfsError = `${error.name}: ${error.message}`
    }
  }
  return result
}
