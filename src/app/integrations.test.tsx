import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { CatalogCandidate } from '../application/catalog-lookup'
import { MusicLibrary } from '../application/music-library'
import { LibraryBackups } from '../application/library-backups'
import { serializeBackup } from '../domain/backup'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { wikidataCatalogClient } from '../infrastructure/catalog/wikidata-client'
import { App } from './App'

let database: AuditoriumDatabase
let repository: IndexedDbRepository
const candidate: CatalogCandidate = {
  id: 'Q999999',
  title: 'Horizonte ficticio',
  artists: ['Conjunto ficticio A', 'Conjunto ficticio B'],
  releaseType: 'album',
  originalYear: 1999,
  catalogReference: {
    provider: 'wikidata',
    entityId: 'Q999999',
    retrievedAt: '2026-10-17T00:00:00.000Z',
    musicBrainzReleaseGroupId: '00000000-0000-4000-8000-000000000099',
    spotifyAlbumIds: ['A'.repeat(22)],
    youtubeVideoIds: ['a'.repeat(11)],
  },
  coverUrl:
    'https://coverartarchive.org/release-group/00000000-0000-4000-8000-000000000099/front-500',
}
beforeEach(() => {
  database = new AuditoriumDatabase('integrations-ui', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  repository = new IndexedDbRepository({ database })
})
afterEach(async () => {
  vi.restoreAllMocks()
  database.close()
  await database.delete()
})
async function form() {
  render(<App repository={repository} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Añadir álbum' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Añadir álbum' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Artista' }), {
    target: { value: 'Conjunto ficticio' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
    target: { value: 'Horizonte ficticio' },
  })
}
async function select() {
  const search = vi
    .spyOn(wikidataCatalogClient, 'search')
    .mockResolvedValue([candidate])
  await form()
  expect(search).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revisar Horizonte ficticio' }),
  )
  return search
}
test('elegir referencia prepara sin escribir; guardar conserva artistas, referencia y enlaces sin descargar imagen', async () => {
  await select()
  expect((await repository.readSnapshot()).catalog.albums).toEqual([])
  expect(
    screen.queryByRole('img', { name: /portada/iu }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText(/Guardar enlace de portada/u)).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  fireEvent.click(await screen.findByRole('button', { name: candidate.title }))
  expect(
    screen.getByRole('link', { name: 'Wikidata · Q999999' }),
  ).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q999999')
  expect(
    screen.getByRole('link', { name: 'Álbum en Spotify' }),
  ).toHaveAttribute('href', `https://open.spotify.com/album/${'A'.repeat(22)}`)
  const snapshot = await repository.readSnapshot()
  expect(snapshot.catalog.albums[0]).toMatchObject({
    catalogReference: candidate.catalogReference,
    originalYear: 1999,
  })
  expect(snapshot.catalog.albums[0]).not.toHaveProperty('coverUrl')
  expect(snapshot.catalog.artists.map(({ name }) => name).toSorted()).toEqual(
    candidate.artists.toSorted(),
  )
  expect(snapshot.catalog.albumArtists).toHaveLength(2)
  const { document: backup } = await new LibraryBackups(repository).export()
  expect(backup.schemaVersion).toBe(2)
  expect(serializeBackup(backup)).toContain('Q999999')
})
test('portada requiere elección y editar identidad quita asociación y portada elegida', async () => {
  await select()
  fireEvent.click(screen.getByLabelText(/Guardar enlace de portada/u))
  expect(screen.getByLabelText('Enlace a portada (HTTPS)')).toHaveValue(
    candidate.coverUrl,
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
    target: { value: 'Otra obra ficticia' },
  })
  expect(
    screen.queryByRole('region', { name: 'Referencia preparada' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Otra obra ficticia' })
  const album = (await repository.readSnapshot()).catalog.albums[0]
  expect(album).not.toHaveProperty('catalogReference')
  expect(album).not.toHaveProperty('coverUrl')
  expect(
    (await repository.readSnapshot()).catalog.artists
      .map(({ name }) => name)
      .toSorted(),
  ).toEqual(candidate.artists.toSorted())
})
test('un fallo del catálogo conserva datos manuales y permite guardar', async () => {
  vi.spyOn(wikidataCatalogClient, 'search').mockRejectedValue(
    new Error('Detalle privado ficticio'),
  )
  await form()
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en Wikidata' }))
  await screen.findByText(/No pudimos consultar Wikidata/u)
  expect(screen.queryByText('Detalle privado ficticio')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Horizonte ficticio',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: candidate.title })
  expect(
    (await repository.readSnapshot()).catalog.albums[0],
  ).not.toHaveProperty('catalogReference')
})
test('abrir duplicado existente no le aplica metadatos ni referencia externos', async () => {
  await new MusicLibrary(repository).createAlbum({
    title: candidate.title,
    artists: candidate.artists.map((name) => ({ name })),
  })
  const before = await repository.readSnapshot()
  await select()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Abrir álbum existente' }),
  )
  await screen.findByRole('button', { name: 'Volver a biblioteca' })
  expect(await repository.readSnapshot()).toEqual(before)
})
