import { AudioSession, demoEntries, demoTracks } from './audio.mjs'
import { benchmark, storedSummary, clearEvaluationStorage } from './storage.mjs'

export const session = new AudioSession()
const element = (id) => document.getElementById(id)
const status = (message, state = 'ready') => {
  element('status').textContent = message
  element('status').dataset.state = state
}
let generation = 0
function tracks() {
  const entry = demoEntries.find((row) => row.id === element('entry').value)
  element('track').replaceChildren(
    new Option('Sin pista concreta', ''),
    ...demoTracks
      .filter((row) => row.albumId === entry.albumId)
      .map((row) => new Option(row.label, row.id)),
  )
}
element('entry').replaceChildren(
  ...demoEntries.map((row) => new Option(row.label, row.id)),
)
tracks()
element('entry').addEventListener('change', () => {
  cancel()
  tracks()
})
element('track').addEventListener('change', cancel)
function busy(value) {
  element('cancel').disabled = !value
}
function cancel() {
  generation++
  session.cancel()
  busy(false)
  status('Selección cancelada. Los archivos anteriores se conservan.')
}
function render() {
  element('player').replaceChildren(...(session.player ? [session.player] : []))
  if (session.player) {
    session.player.setAttribute('aria-label', 'Audio personal temporal')
    session.player.addEventListener(
      'playing',
      () => status('Reproducción iniciada desde el archivo local.'),
      { once: true },
    )
  }
  element('play').disabled = !session.player
  element('replacement').replaceChildren(
    new Option('Añadir archivo temporal', ''),
    ...session.items.map(
      (item) =>
        new Option(
          `Reemplazar ${item.file.name.split(/[\\/]/).at(-1)}`,
          item.id,
        ),
    ),
  )
  element('items').replaceChildren(
    ...session.items.map((item) => {
      const row = document.createElement('li'),
        label = document.createElement('span')
      label.textContent = `${item.file.name.split(/[\\/]/).at(-1)} · ${item.container} · ${item.file.size} bytes · ${item.association.userAlbumId}${item.association.trackId ? ' / ' + item.association.trackId : ''}`
      const activate = document.createElement('button')
      activate.type = 'button'
      activate.textContent = 'Preparar este archivo'
      activate.addEventListener(
        'click',
        () => void select(item.file, item.association, item.id),
      )
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Retirar archivo'
      remove.addEventListener('click', () => {
        generation++
        session.remove(item.id)
        busy(false)
        render()
        status(
          'Archivo retirado. La entrada y experiencia ficticias se conservan.',
        )
      })
      row.append(label, activate, remove)
      return row
    }),
  )
}
async function select(file, association, replaceId) {
  const current = ++generation
  busy(true)
  status('Comprobando contenedor y decodificación…', 'loading')
  try {
    const item = await session.choose(file, association, replaceId || undefined)
    if (current !== generation) return
    render()
    status(
      `Preparado ${item.file.name.split(/[\\/]/).at(-1)}. Pulsa los controles para escuchar; no se conserva tras salir.`,
    )
  } catch (error) {
    if (current !== generation) return
    status(
      error.name === 'AbortError'
        ? 'Selección cancelada; el archivo anterior se conserva.'
        : error.message,
      'error',
    )
  } finally {
    if (current === generation) busy(false)
  }
}
element('file').addEventListener('change', (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) {
    cancel()
    return
  }
  const trackId = element('track').value
  void select(
    file,
    { userAlbumId: element('entry').value, ...(trackId ? { trackId } : {}) },
    element('replacement').value,
  )
})
element('file').addEventListener('cancel', cancel)
element('cancel').addEventListener('click', cancel)
element('play').addEventListener('click', () => {
  if (session.player)
    void session.player
      .play()
      .catch(() =>
        status(
          'El navegador no pudo iniciar el audio. Usa sus controles o elige otro archivo.',
          'error',
        ),
      )
})
element('clear').addEventListener('click', () => {
  generation++
  session.dispose()
  busy(false)
  render()
  status('Sin archivos temporales.')
})
window.addEventListener('pagehide', () => {
  generation++
  session.dispose()
})
async function storageAction(work) {
  for (const id of ['benchmark', 'read-storage', 'clear-storage'])
    element(id).disabled = true
  element('storage-status').textContent =
    'Trabajando sólo con muestras sintéticas…'
  try {
    element('storage-results').textContent = JSON.stringify(
      await work(),
      null,
      2,
    )
    element('storage-status').textContent =
      'Experimento finalizado. Las muestras no son adjuntos personales.'
  } catch (error) {
    element('storage-status').textContent = error.message
  } finally {
    for (const id of ['benchmark', 'read-storage', 'clear-storage'])
      element(id).disabled = false
  }
}
element('benchmark').addEventListener(
  'click',
  () => void storageAction(benchmark),
)
element('read-storage').addEventListener(
  'click',
  () => void storageAction(storedSummary),
)
element('clear-storage').addEventListener(
  'click',
  () =>
    void storageAction(async () => {
      const result = await clearEvaluationStorage()
      return { cleared: result.indexeddb && result.opfs, ...result }
    }),
)
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .register('./sw.mjs', { type: 'module', scope: './' })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      element('offline-status').textContent =
        'Shell del laboratorio preparado para offline. El audio seleccionado sigue siendo temporal.'
    })
    .catch((error) => {
      element('offline-status').textContent =
        `Shell offline no confirmado: ${error.name}: ${error.message}`
    })
}
