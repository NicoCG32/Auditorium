import { expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { serializeBackup } from '../../src/domain/backup'
import { fixtureId } from '../../src/domain/catalog/catalog.fixture'
import { createStoredZip } from '../../src/infrastructure/browser/stored-zip'
import { playbackFixture } from './streaming-fixture'
import { openLibraryOptions } from './library-navigation'
import { syntheticWav } from '../../src/test/audio.fixture'

export const audioName = 'audio-ficticio.wav'
export function audioPayload(name = audioName) {
  const bytes = syntheticWav(44 + 48000 * 6 * 2),
    view = new DataView(bytes.buffer)
  view.setUint32(24, 48000, true)
  view.setUint32(28, 96000, true)
  return Promise.resolve({
    name,
    mimeType: 'audio/wav',
    buffer: Buffer.from(bytes),
  })
}
export async function audioBackup() {
  const fixture = playbackFixture(),
    payload = await audioPayload(),
    library = Buffer.from(serializeBackup(fixture))
  const manifest = {
    format: 'auditorium-audio-backup',
    version: 1,
    identity: fixture.data.identity,
    librarySha256: createHash('sha256').update(library).digest('hex'),
    attachments: [
      {
        id: fixtureId(99001),
        userAlbumId: fixture.data.library.userAlbums[0]!.id,
        name: audioName,
        size: payload.buffer.length,
        container: 'WAV',
        mime: 'audio/wav',
        duration: 6,
        sha256: createHash('sha256').update(payload.buffer).digest('hex'),
        path: `audio/${fixtureId(99001)}.bin`,
      },
    ],
  }
  const bytes = await createStoredZip([
    {
      name: 'audio-manifest.json',
      data: Buffer.from(JSON.stringify(manifest)),
    },
    { name: 'library.json', data: library },
    { name: manifest.attachments[0]!.path, data: payload.buffer },
  ])
  return { fixture, bytes, payload, manifest }
}
export async function openBackups(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
}
export async function restoreAudio(page: Page, base = '/') {
  const source = await audioBackup()
  await page.goto(base)
  await openBackups(page)
  await page.locator('#complete-audio-file').setInputFiles({
    name: 'respaldo-audio-ficticio.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(source.bytes),
  })
  await page
    .getByRole('button', {
      name: 'Confirmar restauración completa',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: `Cargar audio: ${audioName}`,
      exact: true,
    }),
  ).toBeVisible()
  return source
}
export async function audioInventory(page: Page, name = 'auditorium') {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB read failed'))
    })
    try {
      const tx = db.transaction(['audioAttachments', 'audioFiles'], 'readonly')
      const read = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = tx.objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result as T[])
          request.onerror = () =>
            reject(request.error ?? new Error('IndexedDB read failed'))
        })
      const [metadata, files] = await Promise.all([
        read<{ id: string; name: string; trackId?: string; sha256: string }>(
          'audioAttachments',
        ),
        read<{ id: string; bytes: Uint8Array }>('audioFiles'),
      ])
      return {
        metadata,
        files: await Promise.all(
          files.map(async (file) => ({
            id: file.id,
            size: file.bytes.byteLength,
            bufferBytes: file.bytes.buffer.byteLength,
            sha256: [
              ...new Uint8Array(
                await crypto.subtle.digest(
                  'SHA-256',
                  new Uint8Array(file.bytes).buffer,
                ),
              ),
            ]
              .map((x) => x.toString(16).padStart(2, '0'))
              .join(''),
          })),
        ),
      }
    } finally {
      db.close()
    }
  }, name)
}
export async function playPersonalAudio(page: Page, unsupported = false) {
  await page
    .getByRole('button', { name: new RegExp('^Cargar audio:') })
    .first()
    .click()
  if (unsupported) {
    await expect(
      page.getByText('Este navegador no pudo reproducir el formato.', {
        exact: false,
      }),
    ).toBeVisible()
    return
  }
  await expect(
    page.getByRole('button', { name: 'Reproducir audio', exact: true }),
  ).toBeVisible()
  const player = page.locator('audio')
  expect(
    await player.evaluate(
      (audio: HTMLAudioElement) => audio.paused && audio.currentTime === 0,
    ),
  ).toBe(true)
  const play = page.getByRole('button', {
    name: 'Reproducir audio',
    exact: true,
  })
  await play.focus()
  await play.press('Enter')
  try {
    await expect
      .poll(() =>
        player.evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0.05)
  } catch (error) {
    const diagnostic = await player.evaluate((audio: HTMLAudioElement) => ({
      time: audio.currentTime,
      duration: audio.duration,
      paused: audio.paused,
      ended: audio.ended,
      ready: audio.readyState,
      network: audio.networkState,
      error: audio.error?.code,
      visible: document.visibilityState,
    }))
    throw new Error(
      'Native playback did not advance: ' + JSON.stringify(diagnostic),
      { cause: error },
    )
  }
  const pause = page.getByRole('button', { name: 'Pausar audio', exact: true })
  await pause.focus()
  await pause.press('Space')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true)
  const position = page.getByRole('slider', { name: /^Posición del audio:/ })
  await position.focus()
  await position.press('Home')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBe(0)
  await position.press('ArrowRight')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0)
}
