import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fixtureId } from '../src/domain/catalog/catalog.fixture'
import {
  audioBackup,
  audioInventory,
  audioName,
  audioPayload,
  openBackups,
  playPersonalAudio,
  restoreAudio,
} from './helpers/audio-fixture'
import { mockStreaming, playbackBackup } from './helpers/streaming-fixture'

test.use({ serviceWorkers: 'block' })
const windowsWebKit = (project: string) => {
  const unsupported = process.platform === 'win32' && project === 'webkit'
  if (unsupported)
    test.info().annotations.push({
      type: 'native-compatibility',
      description:
        'Windows WebKit cannot decode the Blob fixture; this branch requires a useful error and preserved files. Linux CI requires successful WAV playback.',
    })
  return unsupported
}

test('alta con audio conserva archivos al recargar, sin autoplay ni cambios automáticos de experiencia', async ({
  page,
}, info) => {
  const unsupported = windowsWebKit(info.project.name),
    posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('álbum sintético')
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Banda Ficticia')
  await page
    .getByText('Archivos de audio propios (opcional)', { exact: true })
    .click()
  const file = page.getByLabel('Seleccionar archivo de audio propio', {
    exact: true,
  })
  await expect(file).toBeEnabled()
  await file.setInputFiles(await audioPayload())
  if (unsupported)
    await expect(
      page.getByText(/Este navegador no pudo decodificar el audio/),
    ).toBeVisible()
  else
    await expect(
      page.getByText(/Archivo validado y añadido al borrador/),
    ).toBeVisible()
  expect((await audioInventory(page)).files).toEqual([])
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Álbum Sintético', exact: true }),
  ).toBeVisible()
  const rows = await audioInventory(page)
  expect(rows.files).toHaveLength(unsupported ? 0 : 1)
  if (!unsupported) {
    await playPersonalAudio(page)
    await page.reload()
    await expect(
      page.getByRole('button', {
        name: `Cargar audio: ${audioName}`,
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.locator('audio')).toHaveCount(0)
  }
  const snapshot = (await playbackBackup(page)).data
  expect(snapshot.library.userAlbums[0]!.listeningStatus).toBe('untracked')
  expect(snapshot.library.albumRatings).toEqual([])
  expect(snapshot.library.ownedItems).toEqual([])
  expect(JSON.stringify(snapshot)).not.toContain(audioName)
  expect(posts).toEqual([])
})

test('edición conjunta, formato inválido y cancelar conservan el archivo anterior; el reemplazo se guarda con los datos', async ({
  page,
}, info) => {
  const unsupported = windowsWebKit(info.project.name),
    source = await restoreAudio(page)
  const before = await audioInventory(page)
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page.getByText('Archivos de audio propios', { exact: true }).click()
  await expect(
    page.getByLabel('Seleccionar archivo de audio propio', { exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('combobox', {
      name: 'Destino del audio seleccionado',
      exact: true,
    })
    .selectOption(source.manifest.attachments[0]!.id)
  await page
    .getByLabel('Seleccionar archivo de audio propio', { exact: true })
    .setInputFiles({
      name: 'falso.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('not audio'),
    })
  await expect(page.getByText(/No se reconoce un contenedor/)).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Eclipse Borrador')
  await page
    .getByRole('button', { name: 'Cancelar edición', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  expect(await audioInventory(page)).toEqual(before)
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page.getByText('Archivos de audio propios', { exact: true }).click()
  await expect(
    page.getByLabel('Seleccionar archivo de audio propio', { exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('combobox', {
      name: 'Destino del audio seleccionado',
      exact: true,
    })
    .selectOption(source.manifest.attachments[0]!.id)
  await page
    .getByLabel('Seleccionar archivo de audio propio', { exact: true })
    .setInputFiles(await audioPayload('reemplazo-ficticio.wav'))
  if (unsupported)
    await expect(
      page.getByText(/Este navegador no pudo decodificar el audio/),
    ).toBeVisible()
  else
    await expect(
      page.getByText(/Archivo validado y añadido al borrador/),
    ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Eclipse Corregido')
  await page
    .getByRole('button', { name: 'Guardar cambios del álbum', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse Corregido', exact: true }),
  ).toBeVisible()
  const after = await audioInventory(page)
  expect(after.metadata[0]!.id).toBe(before.metadata[0]!.id)
  expect(after.metadata[0]!.name).toBe(
    unsupported ? audioName : 'reemplazo-ficticio.wav',
  )
  expect(after.files[0]!.sha256).toBe(before.files[0]!.sha256)
  expect((await playbackBackup(page)).data.library).toEqual(
    source.fixture.data.library,
  )
})

test('asociación, ZIP completo y un solo reproductor conservan datos; retirada libera bytes', async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.addInitScript(() => {
    const active = new Set<string>(),
      create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      if (blob instanceof Blob && blob.type.startsWith('audio/'))
        active.add(url)
      document.documentElement.dataset.liveAudioUrls = JSON.stringify([
        ...active,
      ])
      return url
    }
    URL.revokeObjectURL = (url) => {
      active.delete(url)
      revoke(url)
      document.documentElement.dataset.liveAudioUrls = JSON.stringify([
        ...active,
      ])
    }
  })
  await mockStreaming(page)
  const source = await restoreAudio(page),
    unsupported = windowsWebKit(info.project.name)
  await page
    .getByRole('button', { name: 'Gestionar audio', exact: true })
    .click()
  await page
    .getByRole('combobox', {
      name: `Pista de referencia para ${audioName}`,
      exact: true,
    })
    .selectOption(fixtureId(8))
  await page.getByRole('button', { name: 'Guardar audio', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Gestionar audio', exact: true }),
  ).toBeVisible()
  expect((await audioInventory(page)).metadata[0]!.trackId).toBe(fixtureId(8))
  await playPersonalAudio(page, unsupported)
  await page
    .getByRole('button', { name: 'Cargar reproductor de Spotify', exact: true })
    .click()
  await expect(page.locator('iframe')).toHaveCount(1)
  await expect(page.locator('audio')).toHaveCount(0)
  await playPersonalAudio(page, unsupported)
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({
    path: info.outputPath('audio-dark-320.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('details.appearance-panel > summary').click()
  await page.getByRole('radio', { name: 'Claro', exact: true }).check()
  await page.locator('details.appearance-panel > summary').click()
  await page.screenshot({
    path: info.outputPath('audio-light-1280.png'),
    fullPage: true,
  })
  await openBackups(page)
  expect(await page.locator('html').getAttribute('data-live-audio-urls')).toBe(
    '[]',
  )
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo completo con audio (ZIP)',
      exact: true,
    })
    .click()
  const path = info.outputPath('respaldo-completo-ficticio.zip')
  await (await downloading).saveAs(path)
  const target = await browser.newContext()
  try {
    const other = await target.newPage()
    await other.goto(new URL('/', page.url()).href)
    await openBackups(other)
    await other.locator('#complete-audio-file').setInputFiles(path)
    await other
      .getByRole('button', {
        name: 'Confirmar restauración completa',
        exact: true,
      })
      .click()
    await other.getByRole('button', { name: 'Eclipse', exact: true }).click()
    const copied = await audioInventory(other)
    expect(copied.metadata[0]!.trackId).toBe(fixtureId(8))
    expect(copied.files[0]!.size).toBe(source.payload.buffer.length)
    expect(copied.files[0]!.bufferBytes).toBe(copied.files[0]!.size)
    await playPersonalAudio(other, unsupported)
    expect((await playbackBackup(other)).data).toEqual(source.fixture.data)
  } finally {
    await target.close()
  }
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await page
    .getByRole('button', { name: 'Gestionar audio', exact: true })
    .click()
  await page
    .getByRole('button', { name: `Retirar ${audioName}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Guardar audio', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Gestionar audio', exact: true }),
  ).toBeVisible()
  expect((await audioInventory(page)).files).toEqual([])
  expect((await playbackBackup(page)).data).toEqual(source.fixture.data)
})

test('fallo de cuota durante restauración completa revierte todo y permite confirmar una sola recuperación', async ({
  page,
}) => {
  const source = await audioBackup()
  await page.goto('/')
  await openBackups(page)
  const original = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const opening = indexedDB.open('auditorium')
        opening.onsuccess = () => {
          const db = opening.result,
            read = db
              .transaction('metadata')
              .objectStore('metadata')
              .get('local_identity')
          read.onsuccess = () => {
            resolve(read.result)
            db.close()
          }
          read.onerror = () =>
            reject(read.error ?? new Error('IndexedDB metadata read failed'))
        }
      }),
  )
  expect(original).toHaveProperty('userId')
  await page.locator('#complete-audio-file').setInputFiles({
    name: 'cuota-ficticia.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(source.bytes),
  })
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The saved native method is invoked only with .call(this) below.
    const original = IDBObjectStore.prototype.add
    let fail = true
    IDBObjectStore.prototype.add = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'audioAttachments' && fail) {
        fail = false
        throw new DOMException('Injected test quota', 'QuotaExceededError')
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key)
    }
  })
  await page
    .getByRole('button', {
      name: 'Confirmar restauración completa',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('alert').filter({ hasText: /No hay espacio/ }),
  ).toBeVisible()
  expect(await audioInventory(page)).toEqual({ metadata: [], files: [] })
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('auditorium')
          request.onerror = () =>
            reject(new Error('Cannot inspect test database'))
          request.onsuccess = () => {
            const db = request.result,
              count = db.transaction('albums').objectStore('albums').count()
            count.onsuccess = () => {
              resolve(count.result)
              db.close()
            }
            count.onerror = () => reject(new Error('Cannot count test albums'))
          }
        }),
    ),
  ).toBe(0)
  const stillEmpty = await page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const request = indexedDB.open('auditorium')
        request.onsuccess = () => {
          const db = request.result,
            read = db
              .transaction('metadata')
              .objectStore('metadata')
              .get('local_identity')
          read.onsuccess = () => {
            resolve(read.result)
            db.close()
          }
        }
      }),
  )
  expect(stillEmpty).toEqual(original)
  await page
    .getByRole('button', {
      name: 'Confirmar restauración completa',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect((await audioInventory(page)).files).toHaveLength(1)
})

test('dos ventanas detectan conflicto de audio y el borrado completo conserva álbumes y originales', async ({
  page,
  context,
}) => {
  const source = await restoreAudio(page)
  await page
    .getByRole('button', { name: 'Gestionar audio', exact: true })
    .click()
  const other = await context.newPage()
  try {
    await other.goto(page.url())
    await other
      .getByRole('button', { name: 'Gestionar audio', exact: true })
      .click()
    await other
      .getByRole('combobox', {
        name: `Pista de referencia para ${audioName}`,
        exact: true,
      })
      .selectOption(fixtureId(8))
    await page
      .getByRole('combobox', {
        name: `Pista de referencia para ${audioName}`,
        exact: true,
      })
      .selectOption(fixtureId(5))
    await page
      .getByRole('button', { name: 'Guardar audio', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Gestionar audio', exact: true }),
    ).toBeVisible()
    await other
      .getByRole('button', { name: 'Guardar audio', exact: true })
      .click()
    await expect(
      other.getByRole('alert').filter({ hasText: /cambiaron en otra ventana/ }),
    ).toBeVisible()
    expect((await audioInventory(other)).metadata[0]!.trackId).toBe(
      fixtureId(5),
    )
    await other
      .getByRole('button', { name: 'Descartar cambios de audio', exact: true })
      .click()
  } finally {
    await other.close()
  }
  await openBackups(page)
  await page
    .getByText('Administrar copias locales de audio', { exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Eliminar todo el audio local', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Conservar audio', exact: true })
    .click()
  expect((await audioInventory(page)).files).toHaveLength(1)
  await page
    .getByRole('button', { name: 'Eliminar todo el audio local', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Confirmar eliminación del audio local',
      exact: true,
    })
    .click()
  await expect(
    page.getByText(/Copias de audio eliminadas de Auditorium/),
  ).toBeVisible()
  expect((await audioInventory(page)).files).toEqual([])
  expect((await playbackBackup(page)).data).toEqual(source.fixture.data)
})

test('cancelar una selección pendiente conserva el archivo y descarta la respuesta tardía', async ({
  page,
}) => {
  await restoreAudio(page)
  const before = await audioInventory(page)
  await page
    .getByRole('button', { name: 'Gestionar audio', exact: true })
    .click()
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The original Blob is supplied with .call(this).
    const original = Blob.prototype.arrayBuffer
    let held = false
    Blob.prototype.arrayBuffer = function () {
      if (this.size === 128 && !held) {
        held = true
        return new Promise<ArrayBuffer>((resolve, reject) => {
          window.addEventListener(
            'release-test-audio-header',
            () => {
              void original.call(this).then(resolve, reject)
            },
            { once: true },
          )
        })
      }
      return original.call(this)
    }
  })
  await page
    .getByRole('combobox', {
      name: 'Destino del audio seleccionado',
      exact: true,
    })
    .selectOption(before.metadata[0]!.id)
  await page
    .getByLabel('Seleccionar archivo de audio propio', { exact: true })
    .setInputFiles(await audioPayload('tardío-ficticio.wav'))
  await page
    .getByRole('button', { name: 'Cancelar selección de audio', exact: true })
    .click()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('release-test-audio-header')),
  )
  await expect(
    page.getByText(
      'Selección cancelada. Los archivos anteriores se conservan.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('tardío-ficticio.wav', { exact: true }),
  ).toHaveCount(0)
  expect(await audioInventory(page)).toEqual(before)
  await page
    .getByRole('button', { name: 'Descartar cambios de audio', exact: true })
    .click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  expect(await audioInventory(page)).toEqual(before)
})
