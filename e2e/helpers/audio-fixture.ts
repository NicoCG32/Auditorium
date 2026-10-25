import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { serializeBackup } from '../../src/domain/backup'
import { fixtureId } from '../../src/domain/catalog/catalog.fixture'
import { createStoredZip } from '../../src/infrastructure/browser/stored-zip'
import { playbackFixture } from './streaming-fixture'
import { openLibraryOptions } from './library-navigation'

export const audioName = 'audio-ficticio.wav'
export async function audioPayload(name = audioName) {
  return {
    name,
    mimeType: 'audio/wav',
    buffer: await readFile(
      new URL(
        '../../prototypes/audio-01/fixtures/tone-wav-pcm.wav',
        import.meta.url,
      ),
    ),
  }
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
        duration: 1.2,
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
  await player.evaluate((audio: HTMLAudioElement) => {
    audio.loop = true
  })
  const play = page.getByRole('button', {
    name: 'Reproducir audio',
    exact: true,
  })
  await play.focus()
  await play.press('Enter')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.05)
  const pause = page.getByRole('button', { name: 'Pausar audio', exact: true })
  await pause.focus()
  await pause.press('Space')
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true)
  await player.focus()
  const initialPosition = await player.evaluate(
    (audio: HTMLAudioElement) => audio.currentTime,
  )
  let position = initialPosition
  for (
    let control = 0;
    control < 8 && Math.abs(position - initialPosition) < 0.001;
    control++
  ) {
    await page.keyboard.press('ArrowLeft')
    position = await player.evaluate(
      (audio: HTMLAudioElement) => audio.currentTime,
    )
    if (Math.abs(position - initialPosition) < 0.001)
      await page.keyboard.press('Tab')
  }
  expect(Math.abs(position - initialPosition)).toBeGreaterThan(0.001)
}
