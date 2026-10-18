import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  buildAlbumEditExpected,
  updateAlbumInputSchema,
  type AlbumEditExpected,
} from '../../application/album-edit'
import {
  MusicUseCaseError,
  type MusicLibrary,
} from '../../application/music-library'
import {
  artistRoleSchema,
  releaseTypeSchema,
  type AlbumArtist,
} from '../../domain/catalog/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { CoverFields } from './CoverFields'
import { splitGenres } from './album-form-values'
import { releaseTypeLabels } from './labels'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'

interface ArtistDraft {
  key: string
  artistId?: string
  name: string
  country: string
  role: AlbumArtist['role']
  creditedAs: string
}
function draftFrom(expected: AlbumEditExpected) {
  const { album, credits, artists } = expected
  const byId = new Map(artists.map((artist) => [artist.id, artist]))
  return {
    title: album.title,
    releaseType: album.releaseType,
    originalYear: album.originalYear?.toString() ?? '',
    genres: album.genres?.join(', ') ?? '',
    description: album.description ?? '',
    coverUrl: album.coverUrl ?? '',
    coverImage: album.coverImage,
    retainReference: Boolean(album.catalogReference),
    artists: credits.map((credit): ArtistDraft => ({
      key: crypto.randomUUID(),
      artistId: credit.artistId,
      name: byId.get(credit.artistId)?.name ?? '',
      country: byId.get(credit.artistId)?.country ?? '',
      role: credit.role,
      creditedAs: credit.creditedAs ?? '',
    })),
  }
}
interface Props {
  snapshot: LocalSnapshot
  albumId: string
  library: MusicLibrary
  onCommitted: () => Promise<LocalSnapshot>
  onBusyChange: (busy: boolean) => void
  onComplete: () => void
  onCancel: () => void
}

export function AlbumEditPanel({
  snapshot,
  albumId,
  library,
  onCommitted,
  onBusyChange,
  onComplete,
  onCancel,
}: Props) {
  const draftId = `edit:${albumId}`
  const [expected, setExpected] = useDraftState(draftId, 'expected', () =>
    buildAlbumEditExpected(snapshot, albumId),
  )
  const [draft, setDraft] = useDraftState(draftId, 'values', () =>
    draftFrom(expected),
  )
  const [busy, setBusy] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [pendingRead, setPendingRead] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState('')
  const [invalid, setInvalid] = useState(false)
  const locked = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const readButton = useRef<HTMLButtonElement>(null)
  const comparable = (value: typeof draft) =>
    JSON.stringify({
      ...value,
      artists: value.artists.map((artist) => [
        artist.artistId,
        artist.name,
        artist.country,
        artist.role,
        artist.creditedAs,
      ]),
    })
  useDraftGuard({
    id: draftId,
    label: 'Datos del álbum',
    dirty: comparable(draft) !== comparable(draftFrom(expected)),
    busy: busy || coverBusy,
    pendingRead,
    ...(pendingRead || conflict
      ? { focus: () => readButton.current?.focus() }
      : {}),
    form,
  })
  useEffect(() => {
    heading.current?.focus()
  }, [])
  useEffect(() => {
    if (!busy && (pendingRead || conflict)) readButton.current?.focus()
  }, [busy, pendingRead, conflict])
  const disabled = busy || pendingRead
  function edit(change: Partial<typeof draft>) {
    setDraft((previous) => ({ ...previous, ...change }))
    setInvalid(false)
    setFailure('')
  }
  function editArtist(key: string, change: Partial<ArtistDraft>) {
    const selected = draft.artists.find((artist) => artist.key === key)
    edit({
      artists: draft.artists.map((artist) =>
        artist.key === key ||
        ('country' in change &&
          selected?.artistId &&
          artist.artistId === selected.artistId &&
          artist.name === selected.name)
          ? { ...artist, ...change }
          : artist,
      ),
    })
  }
  async function refresh(replace: boolean) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    try {
      const current = await onCommitted()
      if (replace) {
        const nextExpected = buildAlbumEditExpected(current, albumId)
        setExpected(nextExpected)
        setDraft(draftFrom(nextExpected))
        setConflict(false)
        setFailure('')
      } else onComplete()
      onBusyChange(false)
    } catch {
      setFailure(
        replace
          ? 'No se pudieron cargar los datos guardados. Tu borrador se conserva.'
          : 'Los cambios se guardaron, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.',
      )
      if (replace) onBusyChange(false)
    } finally {
      setBusy(false)
      locked.current = false
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || coverBusy || pendingRead || conflict) return
    const year = draft.originalYear.trim()
    const genresUnchanged =
      draft.genres === (expected.album.genres?.join(', ') ?? '')
    const genres = genresUnchanged
      ? (expected.album.genres ?? [])
      : splitGenres(draft.genres)
    const parsed = updateAlbumInputSchema.safeParse({
      albumId,
      expected,
      title: draft.title,
      releaseType: draft.releaseType,
      ...(year
        ? { originalYear: /^\d{1,4}$/u.test(year) ? Number(year) : Number.NaN }
        : {}),
      ...(genres.length ||
      (genresUnchanged && expected.album.genres !== undefined)
        ? { genres }
        : {}),
      ...(draft.description.trim() ? { description: draft.description } : {}),
      ...(draft.coverUrl.trim() ? { coverUrl: draft.coverUrl.trim() } : {}),
      ...(draft.coverImage ? { coverImage: draft.coverImage } : {}),
      ...(draft.retainReference && expected.album.catalogReference
        ? { catalogReference: expected.album.catalogReference }
        : {}),
      artists: draft.artists.map((artist) => ({
        ...(artist.artistId ? { artistId: artist.artistId } : {}),
        name: artist.name,
        role: artist.role,
        ...(artist.country.trim() ? { country: artist.country.trim() } : {}),
        ...(artist.creditedAs.trim()
          ? { creditedAs: artist.creditedAs.trim() }
          : {}),
      })),
    })
    if (!parsed.success) {
      setInvalid(true)
      setFailure(
        parsed.error.issues[0]?.code === 'custom'
          ? parsed.error.issues[0].message
          : 'Revisa título, artistas, año, géneros y portada. Debe quedar al menos un artista principal; usa un año entre 1 y 9999 y hasta 20 géneros de 80 caracteres.',
      )
      const path = parsed.error.issues[0]?.path ?? []
      const fieldName =
        path[0] === 'artists'
          ? `artist-${String(path[1] ?? 0)}`
          : String(path[0] ?? 'title')
      form.current?.querySelector<HTMLElement>(`[name="${fieldName}"]`)?.focus()
      return
    }
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await library.updateAlbum(parsed.data)
    } catch (error) {
      if (
        error instanceof MusicUseCaseError &&
        error.code === 'outdated_album'
      ) {
        setConflict(true)
        setFailure(
          'Los datos del álbum o de sus artistas cambiaron desde que abriste el editor. Tu borrador se conserva. Cargar los datos guardados reemplazará este formulario.',
        )
      } else
        setFailure(
          error instanceof LocalStorageError && error.code === 'quota_exceeded'
            ? 'No hay espacio para guardar. El álbum anterior y tu borrador se conservan; libera espacio y vuelve a intentar.'
            : 'No se pudieron guardar los cambios. El álbum anterior y tu borrador se conservan.',
        )
      onBusyChange(false)
      setBusy(false)
      locked.current = false
      return
    }
    setPendingRead(true)
    try {
      await onCommitted()
      onBusyChange(false)
      onComplete()
    } catch {
      setFailure(
        'Los cambios se guardaron, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.',
      )
    } finally {
      setBusy(false)
      locked.current = false
    }
  }
  return (
    <section
      className="album-form-panel album-edit-panel"
      aria-labelledby="edit-album-title"
    >
      <h2
        id="edit-album-title"
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold"
      >
        Editar álbum
      </h2>
      <p className="mt-3 mb-6 text-sm text-muted">
        Corrige los datos del álbum. Tus valoraciones, notas, pistas, ediciones
        y colección se conservan.
      </p>
      <form
        ref={form}
        onSubmit={(event) => void save(event)}
        noValidate
        autoComplete="off"
      >
        <fieldset disabled={disabled} className="album-form-fields">
          <label>
            <span className="field-label">Título</span>
            <input
              name="title"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              required
            />
          </label>
          <div className="form-grid">
            <label>
              <span className="field-label">Tipo</span>
              <select
                value={draft.releaseType}
                name="releaseType"
                onChange={(event) =>
                  edit({
                    releaseType: releaseTypeSchema.parse(event.target.value),
                  })
                }
              >
                {releaseTypeSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {releaseTypeLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Año original</span>
              <input
                name="originalYear"
                inputMode="numeric"
                value={draft.originalYear}
                onChange={(event) => edit({ originalYear: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span className="field-label">Géneros (separados por comas)</span>
            <input
              name="genres"
              value={draft.genres}
              placeholder="Rock, jazz, metal…"
              onChange={(event) => edit({ genres: event.target.value })}
            />
          </label>
          <fieldset className="edit-artists">
            <legend className="font-semibold">Artistas y país de origen</legend>
            <p className="mt-3 text-xs text-muted">
              El país de un artista se comparte con sus otros álbumes. Cambiar
              el nombre crea un crédito separado para este álbum y conserva los
              demás.
            </p>
            {draft.artists.map((artist, index) => (
              <div key={artist.key} className="edit-artist-row">
                <label>
                  <span className="field-label">Artista {index + 1}</span>
                  <input
                    name={`artist-${index}`}
                    value={artist.name}
                    onChange={(event) =>
                      editArtist(artist.key, { name: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span className="field-label">
                    País de origen {index + 1}
                  </span>
                  <input
                    value={artist.country}
                    maxLength={100}
                    onChange={(event) =>
                      editArtist(artist.key, { country: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span className="field-label">Rol {index + 1}</span>
                  <select
                    value={artist.role}
                    onChange={(event) =>
                      editArtist(artist.key, {
                        role: artistRoleSchema.parse(event.target.value),
                      })
                    }
                  >
                    {artistRoleSchema.options.map((role) => (
                      <option key={role} value={role}>
                        {
                          {
                            primary: 'Principal',
                            collaborator: 'Colaborador',
                            featured: 'Invitado',
                            other: 'Otro',
                          }[role]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">
                    Nombre acreditado {index + 1} (opcional)
                  </span>
                  <input
                    value={artist.creditedAs}
                    onChange={(event) =>
                      editArtist(artist.key, { creditedAs: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  disabled={draft.artists.length === 1}
                  onClick={() =>
                    edit({
                      artists: draft.artists.filter(
                        (row) => row.key !== artist.key,
                      ),
                    })
                  }
                >
                  Quitar artista {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="action-button mt-4"
              disabled={draft.artists.length >= 50}
              onClick={() =>
                edit({
                  artists: [
                    ...draft.artists,
                    {
                      key: crypto.randomUUID(),
                      name: '',
                      country: '',
                      role: 'primary',
                      creditedAs: '',
                    },
                  ],
                })
              }
            >
              Añadir artista
            </button>
          </fieldset>
          <CoverFields
            url={draft.coverUrl}
            {...(draft.coverImage ? { image: draft.coverImage } : {})}
            onChange={edit}
            onBusyChange={setCoverBusy}
            disabled={disabled}
          />
          <label>
            <span className="field-label">Descripción del álbum</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
            />
          </label>
          {expected.album.catalogReference ? (
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={draft.retainReference}
                onChange={(event) =>
                  edit({ retainReference: event.target.checked })
                }
              />
              <span>
                Conservar referencia Wikidata{' '}
                {expected.album.catalogReference.entityId}. Cambiar título o
                créditos descartará su asociación.
              </span>
            </label>
          ) : null}
          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={coverBusy || conflict}
            >
              Guardar cambios del álbum
            </button>
            <button type="button" className="action-button" onClick={onCancel}>
              Cancelar edición
            </button>
          </div>
        </fieldset>
      </form>
      {failure ? (
        <p
          role="alert"
          className="field-error"
          aria-live={invalid ? 'polite' : 'assertive'}
        >
          {failure}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {pendingRead ? 'Actualizando ficha…' : 'Guardando cambios…'}
        </p>
      ) : null}
      {pendingRead || conflict ? (
        <button
          ref={readButton}
          type="button"
          className="action-button mt-4"
          disabled={busy}
          onClick={() => void refresh(conflict)}
        >
          {pendingRead
            ? 'Reintentar lectura del álbum'
            : 'Cargar datos guardados del álbum'}
        </button>
      ) : null}
    </section>
  )
}
