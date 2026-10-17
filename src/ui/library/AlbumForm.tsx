import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  matchingArtists,
  type AlbumCandidate,
} from '../../application/album-candidates'
import type { MusicLibrary } from '../../application/music-library'
import type { CatalogCandidate } from '../../application/catalog-lookup'
import { releaseTypeSchema } from '../../domain/catalog/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { CatalogLookupPanel } from '../catalog/CatalogLookupPanel'
import {
  emptyAlbumForm,
  parseAlbumForm,
  prepareCatalogCandidate,
  type AlbumFormValues,
} from './album-form-values'
import { releaseTypeLabels } from './labels'

interface Props {
  snapshot: LocalSnapshot
  library: MusicLibrary
  onComplete: (entryId: string, openExisting: boolean) => void
  onCancel: () => void
}
export function AlbumForm({ snapshot, library, onComplete, onCancel }: Props) {
  const [values, setValues] = useState(emptyAlbumForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [review, setReview] = useState<AlbumCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [offeredCover, setOfferedCover] = useState<string>()
  const locked = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const artistRef = useRef<HTMLInputElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const selectionHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    artistRef.current?.focus()
  }, [])
  useEffect(() => {
    if (review.length > 0) reviewHeading.current?.focus()
  }, [review])
  useEffect(() => {
    if (values.catalogReference) selectionHeading.current?.focus()
  }, [values.catalogReference])
  const artists = matchingArtists(snapshot.catalog.artists, values.artist)
  function edit(change: Partial<AlbumFormValues>) {
    const changesArtists = 'artist' in change || 'artistId' in change
    const changesIdentity = 'title' in change || changesArtists
    setValues((previous) => ({
      ...previous,
      ...change,
      ...(changesIdentity
        ? {
            catalogReference: undefined,
            ...(changesArtists ? { catalogArtists: undefined } : {}),
            ...(offeredCover && previous.coverUrl === offeredCover
              ? { coverUrl: '' }
              : {}),
          }
        : {}),
    }))
    if (changesIdentity) setOfferedCover(undefined)
    setErrors({})
    setFailure('')
    setReview([])
  }
  function selectCatalogCandidate(candidate: CatalogCandidate) {
    setValues((previous) =>
      prepareCatalogCandidate(
        {
          ...previous,
          ...(offeredCover && previous.coverUrl === offeredCover
            ? { coverUrl: '' }
            : {}),
        },
        candidate,
      ),
    )
    setOfferedCover(candidate.coverUrl)
    setErrors({})
    setFailure('')
    setReview([])
  }
  function errorFor(field: string) {
    return errors[field] ? (
      <p id={`error-${field}`} className="field-error">
        {errors[field]}
      </p>
    ) : null
  }
  async function save(acknowledge = false) {
    if (locked.current) return
    const parsed = parseAlbumForm(values)
    if (!parsed.success) {
      setErrors(parsed.errors)
      const first = Object.keys(parsed.errors)[0]
      const field = formRef.current?.querySelector<HTMLElement>(
        `[name="${first}"]`,
      )
      const details = field?.closest<HTMLDetailsElement>('details')
      if (details) details.open = true
      field?.focus()
      return
    }
    locked.current = true
    setBusy(true)
    setFailure('')
    try {
      const result = await library.registerAlbum(
        parsed.input,
        acknowledge ? review.map((candidate) => candidate.album.id) : [],
      )
      if (result.status === 'review') setReview(result.candidates)
      else onComplete(result.userAlbum.id, false)
    } catch (error) {
      setFailure(
        error instanceof LocalStorageError && error.code === 'quota_exceeded'
          ? 'No hay espacio para guardar. Los datos del formulario se conservan; libera espacio y vuelve a intentar.'
          : 'No se pudo guardar el álbum. Los datos del formulario se conservan; vuelve a intentar.',
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function chooseCandidate(candidate: AlbumCandidate) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setFailure('')
    try {
      const entry = await library.addAlbumToLibrary(candidate.album.id)
      onComplete(entry.id, true)
    } catch {
      setFailure(
        'No se pudo abrir o añadir el álbum seleccionado. Vuelve a intentar.',
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save()
  }
  return (
    <section className="album-form-panel" aria-labelledby="add-album-title">
      <p className="mb-3 text-xs tracking-widest text-accent-text uppercase">
        Tu catálogo
      </p>
      <h2 id="add-album-title" className="text-3xl font-semibold">
        Añadir álbum
      </h2>
      <p className="mt-3 mb-7 text-sm text-muted">
        Artista y título son suficientes. Los demás datos pueden esperar.
      </p>
      <form ref={formRef} onSubmit={submit} noValidate autoComplete="off">
        <fieldset disabled={busy} className="album-form-fields">
          <div className="form-grid">
            <label>
              <span id="form-artist-label" className="field-label">
                Artista <span aria-hidden="true">*</span>
              </span>
              <input
                ref={artistRef}
                name="artist"
                aria-labelledby="form-artist-label"
                required
                value={values.artist}
                aria-invalid={Boolean(errors.artist)}
                aria-describedby={errors.artist ? 'error-artist' : undefined}
                onChange={(event) =>
                  edit({ artist: event.target.value, artistId: undefined })
                }
              />
              {errorFor('artist')}
            </label>
            <label>
              <span id="form-title-label" className="field-label">
                Título <span aria-hidden="true">*</span>
              </span>
              <input
                name="title"
                aria-labelledby="form-title-label"
                required
                value={values.title}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'error-title' : undefined}
                onChange={(event) => edit({ title: event.target.value })}
              />
              {errorFor('title')}
            </label>
          </div>
          {values.catalogArtists && values.catalogArtists.length > 1 ? (
            <p className="text-sm text-muted">
              Artistas conservados por separado:{' '}
              {values.catalogArtists.join(' · ')}. Editar «Artista» reemplazará
              estos créditos por el nombre escrito.
            </p>
          ) : null}
          <CatalogLookupPanel
            title={values.title}
            artist={values.artist}
            onSelect={selectCatalogCandidate}
            disabled={busy}
          />
          {values.catalogReference ? (
            <section
              className="catalog-selection"
              aria-label="Referencia preparada"
            >
              <h3
                ref={selectionHeading}
                tabIndex={-1}
                className="font-semibold"
              >
                Referencia preparada para guardar
              </h3>
              <p className="mt-2 text-sm text-muted">
                Revisa los datos del formulario. La referencia de Wikidata{' '}
                {values.catalogReference.entityId} se guardará al confirmar el
                álbum. Editar artista o título quitará esta asociación.
              </p>
              {values.catalogArtists ? (
                <p className="mt-2 text-sm">
                  Créditos: {values.catalogArtists.join(' · ')}. Se conservará
                  cada artista por separado.
                </p>
              ) : null}
              {offeredCover ? (
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={values.coverUrl === offeredCover}
                    onChange={(event) =>
                      edit({
                        coverUrl: event.target.checked ? offeredCover : '',
                      })
                    }
                  />
                  <span>
                    Guardar enlace de portada de Cover Art Archive (puede no
                    estar disponible). La imagen sólo se consultará al pulsar
                    «Mostrar portada».
                  </span>
                </label>
              ) : null}
              <button
                type="button"
                className="text-button mt-3"
                onClick={() => edit({ catalogReference: undefined })}
              >
                Quitar referencia
              </button>
            </section>
          ) : null}
          {artists.length > 0 && !values.catalogArtists ? (
            <fieldset className="artist-options">
              <legend className="text-sm font-semibold">
                Hay artistas con este nombre
              </legend>
              <p className="my-3 text-sm text-muted">
                Elige uno para reutilizarlo o continúa con un artista nuevo.
              </p>
              <label className="radio-option">
                <input
                  type="radio"
                  name="artist-choice"
                  checked={values.artistId === undefined}
                  onChange={() => edit({ artistId: undefined })}
                />
                Crear un artista nuevo con este nombre
              </label>
              {artists.map((artist) => {
                const albumIds = new Set(
                  snapshot.catalog.albumArtists
                    .filter((credit) => credit.artistId === artist.id)
                    .map((credit) => credit.albumId),
                )
                const titles = snapshot.catalog.albums
                  .filter((album) => albumIds.has(album.id))
                  .slice(0, 3)
                  .map((album) => album.title)
                  .join(', ')
                return (
                  <label key={artist.id} className="radio-option">
                    <input
                      type="radio"
                      name="artist-choice"
                      checked={values.artistId === artist.id}
                      onChange={() =>
                        edit({ artistId: artist.id, artist: artist.name })
                      }
                    />
                    <span>
                      Usar {artist.name}
                      <small className="mt-1 block text-muted">
                        {titles || 'Sin álbumes registrados'}
                      </small>
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ) : null}
          <label>
            <span id="form-type-label" className="field-label">
              Tipo
            </span>
            <select
              name="releaseType"
              aria-labelledby="form-type-label"
              value={values.releaseType}
              onChange={(event) => edit({ releaseType: event.target.value })}
            >
              {releaseTypeSchema.options.map((type) => (
                <option key={type} value={type}>
                  {releaseTypeLabels[type]}
                </option>
              ))}
            </select>
            {errorFor('releaseType')}
          </label>
          <details className="optional-fields">
            <summary>Más datos (opcionales)</summary>
            <div className="mt-5 grid gap-5">
              <label>
                <span id="form-year-label" className="field-label">
                  Año original
                </span>
                <input
                  name="originalYear"
                  aria-labelledby="form-year-label"
                  inputMode="numeric"
                  value={values.originalYear}
                  aria-invalid={Boolean(errors.originalYear)}
                  aria-describedby={
                    errors.originalYear ? 'error-originalYear' : undefined
                  }
                  onChange={(event) =>
                    edit({ originalYear: event.target.value })
                  }
                />
                {errorFor('originalYear')}
              </label>
              <label>
                <span id="form-cover-label" className="field-label">
                  Enlace a portada (HTTPS)
                </span>
                <input
                  name="coverUrl"
                  aria-labelledby="form-cover-label"
                  type="url"
                  value={values.coverUrl}
                  aria-invalid={Boolean(errors.coverUrl)}
                  aria-describedby={
                    errors.coverUrl ? 'error-coverUrl' : undefined
                  }
                  onChange={(event) => edit({ coverUrl: event.target.value })}
                />
                {errorFor('coverUrl')}
              </label>
              <label>
                <span id="form-description-label" className="field-label">
                  Descripción del álbum
                </span>
                <textarea
                  name="description"
                  aria-labelledby="form-description-label"
                  rows={3}
                  value={values.description}
                  onChange={(event) =>
                    edit({ description: event.target.value })
                  }
                />
                {errorFor('description')}
              </label>
            </div>
          </details>
          {review.length > 0 ? (
            <section
              className="duplicate-review"
              aria-labelledby="duplicate-title"
            >
              <h3
                id="duplicate-title"
                ref={reviewHeading}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Encontramos registros parecidos
              </h3>
              <p className="mt-2 text-sm text-muted" role="status">
                Comprueba si es el mismo álbum. Ningún registro se ha creado ni
                fusionado.
                {values.catalogReference
                  ? ' Abrir uno existente conservará sus datos y su referencia actual.'
                  : ''}
              </p>
              <ul className="my-4 grid gap-4">
                {review.map((candidate) => (
                  <li key={candidate.album.id} className="candidate-row">
                    <p className="font-semibold">{candidate.album.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {candidate.artist} ·{' '}
                      {releaseTypeLabels[candidate.album.releaseType]} ·{' '}
                      {candidate.album.originalYear ?? 'Sin año'}
                    </p>
                    <button
                      type="button"
                      className="action-button mt-3"
                      onClick={() => {
                        void chooseCandidate(candidate)
                      }}
                    >
                      {candidate.activeEntryId
                        ? 'Abrir álbum existente'
                        : 'Añadir álbum del catálogo'}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="action-button"
                onClick={() => {
                  void save(true)
                }}
              >
                Crear otro álbum
              </button>
            </section>
          ) : null}
          {failure ? (
            <p role="alert" className="field-error">
              {failure}
            </p>
          ) : null}
          {Object.keys(errors).length > 0 ? (
            <p role="alert" className="field-error">
              Revisa los campos indicados antes de guardar.
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="text-sm text-muted">
              Guardando…
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            {review.length === 0 ? (
              <button type="submit" className="primary-button">
                Guardar álbum
              </button>
            ) : null}
            <button type="button" className="action-button" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
