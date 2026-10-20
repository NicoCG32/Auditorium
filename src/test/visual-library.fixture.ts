import { MusicLibrary } from '../application/music-library'
import { backupSchema } from '../domain/backup'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import type { TransactionalLocalRepository } from '../domain/repositories/local-repository'

export async function visualLibraryBackup() {
  const backup = makeBackup()
  let snapshot = structuredClone(backup.data)
  let nextId = 20000
  const repository: TransactionalLocalRepository = {
    open: () => Promise.resolve(snapshot.identity),
    readSnapshot: () => Promise.resolve(structuredClone(snapshot)),
    close: () => {},
    mutate: (change) => {
      const next = change(structuredClone(snapshot))
      snapshot = next.snapshot
      return Promise.resolve(next.result)
    },
  }
  const library = new MusicLibrary(repository, {
    createId: () => fixtureId(nextId++),
    now: () => new Date('2026-03-01T12:00:00Z'),
  })
  const rows = [
    [
      'Marea De Ceniza',
      'Solsticio Ficticio',
      'Chile',
      'Metal Progresivo',
      2004,
      8.5,
    ],
    ['Jardín Lunar', 'Órbita Ficticia', 'México', 'Rock Psicodélico', 2012, 9],
    [
      'Luz Entre Ruinas',
      'Eco Boreal',
      'Finlandia',
      'Post-Metal',
      2018,
      undefined,
    ],
    ['Ritos Del Horizonte', 'Bosque Ficticio', 'Chile', 'Folk Metal', 2020, 7],
    [
      'Atlas De Sombras',
      'Umbral Ficticio',
      'Noruega',
      'Black Metal',
      1999,
      undefined,
    ],
    ['Señales Del Alba', 'Bruma Ficticia', 'España', 'Ambient', 2023, 8],
  ] as const
  for (const [
    index,
    [title, name, country, genre, originalYear, score],
  ] of rows.entries()) {
    const created = await library.createAlbum({
      title,
      originalYear,
      genres: [genre],
      artists: [{ name, country }],
      ...(index < 5
        ? { coverUrl: `https://covers.example.invalid/visual-${index}.svg` }
        : {}),
    })
    if (created.userAlbum) {
      await library.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus:
          index === 0 || index === 2
            ? 'queued'
            : index === 3
              ? 'in_progress'
              : 'completed',
      })
      if (score !== undefined)
        await library.rateAlbum(created.userAlbum.id, score)
    }
  }
  return backupSchema.parse({ ...backup, data: snapshot })
}

export function visualCover(index: number) {
  const palette = ['#4c2d48', '#35565b', '#49456d', '#6c492a', '#263c50']
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><title>Portada ficticia</title><rect width="480" height="480" fill="${palette[index % palette.length]}"/><circle cx="310" cy="155" r="87" fill="#dcc9a4"/><path d="M0 390 150 160 310 390 390 240 480 390V480H0Z" fill="#14191f"/><path d="M0 430 150 300 260 430 380 340 480 460V480H0Z" fill="#080b10"/><path d="M24 24H456V456H24Z" fill="none" stroke="#dcc9a4" opacity=".5"/><path d="M42 42H438V438H42Z" fill="none" stroke="#dcc9a4" opacity=".2"/></svg>`
}
