import { expect, test } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { projectLibrary } from './library-query'
import { indexLibraryHoldings, inCollectionMedium } from './library-holdings'

test('físico y digital cuentan álbumes por sus copias y un mismo álbum puede estar en ambos', () => {
  const snapshot = makeBackup().data
  const before = structuredClone(snapshot)
  snapshot.library.ownedItems.push(
    { ...snapshot.library.ownedItems[0]!, id: fixtureId(900) },
    {
      id: fixtureId(901),
      userAlbumId: libraryIds.entry,
      medium: 'purchased_digital',
      format: 'digital_download',
      createdAt: times.updated,
    },
    {
      id: fixtureId(902),
      userAlbumId: libraryIds.otherEntry,
      medium: 'physical',
      format: 'vinyl',
      createdAt: times.updated,
    },
  )
  const expected = structuredClone(snapshot)
  const albums = projectLibrary(snapshot)
  const result = indexLibraryHoldings(snapshot, albums)
  expect(result.counts).toEqual({ all: 1, physical: 1, digital: 1 })
  const holding = result.holdings.get(libraryIds.entry)
  expect(holding).toEqual({
    copies: 3,
    physical: 2,
    digital: 1,
    wishes: 1,
    formats: ['cd', 'digital_download'],
  })
  expect(result.holdings.has(libraryIds.otherEntry)).toBe(false)
  expect(inCollectionMedium(holding, 'physical')).toBe(true)
  expect(inCollectionMedium(holding, 'digital')).toBe(true)
  expect(snapshot).toEqual(expected)
  expect(snapshot.library.albumRatings).toEqual(before.library.albumRatings)
})

test('un álbum registrado, deseado o con enlace no se convierte en una compra digital', () => {
  const snapshot = makeBackup().data
  snapshot.library.ownedItems = []
  const result = indexLibraryHoldings(snapshot, projectLibrary(snapshot))
  expect(result.counts).toEqual({ all: 1, physical: 0, digital: 0 })
  const holding = result.holdings.get(libraryIds.entry)
  expect(holding?.wishes).toBe(1)
  expect(inCollectionMedium(holding, 'digital')).toBe(false)
  expect(inCollectionMedium(holding, 'physical')).toBe(false)
  expect(inCollectionMedium(holding, 'all')).toBe(true)
  expect(inCollectionMedium(undefined, 'all')).toBe(true)
})
