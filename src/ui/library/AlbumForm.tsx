import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { catalogSuggestions } from '../../application/catalog-suggestions'
import { CatalogNameInput } from './CatalogNameInput'
import {
  matchingArtists,
  type AlbumCandidate,
} from '../../application/album-candidates'
import type { MusicLibrary } from '../../application/music-library'
import { MusicUseCaseError } from '../../application/music-library'
import { personalLinksFrom } from '../../application/personal-links'
import { ArtistReuseChoice } from './ArtistReuseChoice'
import { PersonalLinksEditor } from './PersonalLinksEditor'
import { linksInputFrom } from './personal-links-values'
import type { CatalogCandidate } from '../../application/catalog-lookup'
import { catalogNameKey } from '../../application/catalog-names'
import { AlbumClassificationFields } from './AlbumClassificationFields'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { CatalogLookupPanel } from '../catalog/CatalogLookupPanel'
import {
  emptyAlbumForm,
  parseAlbumForm,
  prepareCatalogCandidate,
  type AlbumFormValues,
} from './album-form-values'
import { classificationLabel } from '../../domain/catalog/classification'
import { focusFormField } from './form-focus'
import { CoverFields } from './CoverFields'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'
import { useAudioDraft } from './use-audio-draft'
import { AudioEditor } from './AudioEditor'
import { AudioError } from '../../domain/audio'

interface Props {
  snapshot: LocalSnapshot
  library: MusicLibrary
  onComplete: (entryId: string, openExisting: boolean) => void
  onCancel: () => void
  onCommitted: () => Promise<LocalSnapshot>
}
export function AlbumForm({
  snapshot,
  library,
  onComplete,
  onCancel,
  onCommitted,
}: Props) {
  const [values, setValues] = useDraftState(
    'new-album',
    'values',
    emptyAlbumForm,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [linksConflict, setLinksConflict] = useState(false)
  const [review, setReview] = useDraftState<AlbumCandidate[]>(
    'new-album',
    'review',
    [],
  )
  const [busy, setBusy] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
  const audio = useAudioDraft('new-album', snapshot.identity, library.audio)
  const [offeredCover, setOfferedCover] = useDraftState<string | undefined>(
    'new-album',
    'offered-cover',
    undefined,
  )
  const [pending, setPending] = useState<{ id: string; existing: boolean }>()
  const locked = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const artistRef = useRef<HTMLInputElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const selectionHeading = useRef<HTMLHeadingElement>(null)
  const saveHeading = useRef<HTMLHeadingElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  useDraftGuard({
    id: 'new-album',
    label: 'Nuevo álbum',
    dirty:
      JSON.stringify(values) !== JSON.stringify(emptyAlbumForm) || audio.dirty,
    busy: busy || coverBusy || audioBusy,
    pendingRead: Boolean(pending),
    ...(pending ? { focus: () => retry.current?.focus() } : {}),
    form: formRef,
  })
  useEffect(() => {
    if (pending && !busy) retry.current?.focus()
  }, [pending, busy, failure])
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
  const suggestions = useMemo(
    () => catalogSuggestions(snapshot.catalog),
    [snapshot.catalog],
  )
  function edit(change: Partial<AlbumFormValues>) {
    const changesArtists =
      ('artist' in change &&
        catalogNameKey(change.artist ?? '') !==
          catalogNameKey(
            values.catalogArtists?.join(' · ') ?? values.artist,
          )) ||
      ('artistId' in change && change.artistId !== values.artistId)
    const changesIdentity =
      changesArtists ||
      ('title' in change &&
        catalogNameKey(change.title ?? '') !== catalogNameKey(values.title))
    setValues((previous) => ({
      ...previous,
      ...change,
      ...(changesIdentity
        ? {
            catalogReference: undefined,
            ...(changesArtists ? { catalogArtists: undefined } : {}),
            ...(changesArtists ? { catalogCountries: undefined } : {}),
            ...(changesArtists
              ? {
                  catalogArtistIds: undefined,
                  catalogArtistConfirmed: undefined,
                }
              : {}),
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
    setLinksConflict(false)
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
    if (locked.current || coverBusy || audioBusy || pending) return
    if (
      artists.length &&
      !values.catalogArtists &&
      !values.artistId &&
      !values.newArtistConfirmed
    ) {
      setErrors({
        artist:
          'Elige el artista existente o confirma que es otro artista con el mismo nombre.',
      })
      formRef.current
        ?.querySelector<HTMLInputElement>('[name^="artist-choice-"]')
        ?.focus()
      return
    }
    if (
      values.catalogArtists?.some(
        (name, index) =>
          matchingArtists(snapshot.catalog.artists, name).length &&
          !values.catalogArtistIds?.[index] &&
          !values.catalogArtistConfirmed?.[index],
      )
    ) {
      setErrors({
        artist:
          'Revisa los artistas de los créditos y elige una coincidencia o confirma un homónimo.',
      })
      const details = formRef.current?.querySelector<HTMLDetailsElement>(
        'details.album-details',
      )
      if (details) details.open = true
      formRef.current
        ?.querySelector<HTMLInputElement>('[name^="artist-choice-"]')
        ?.focus()
      return
    }
    const parsed = parseAlbumForm(values)
    if (!parsed.success) {
      setErrors(parsed.errors)
      const first = Object.keys(parsed.errors)[0]
      const field = formRef.current?.querySelector<HTMLElement>(
        first === 'personalLinks' ? '[name^="link-url-"]' : `[name="${first}"]`,
      )
      focusFormField(field)
      return
    }
    locked.current = true
    setBusy(true)
    setFailure('')
    try {
      const result = await library.registerAlbum(
        parsed.input,
        acknowledge ? review.map((candidate) => candidate.album.id) : [],
        audio.dirty ? audio.value : undefined,
      )
      if (result.status === 'review') setReview(result.candidates)
      else {
        const committed = { id: result.userAlbum.id, existing: false }
        audio.accept(result.userAlbum.id)
        setPending(committed)
        await synchronize(committed)
      }
    } catch (error) {
      setFailure(
        error instanceof AudioError
          ? error.message
          : error instanceof LocalStorageError &&
              error.code === 'quota_exceeded'
            ? 'No hay espacio para guardar. Los datos del formulario se conservan; libera espacio y vuelve a intentar.'
            : 'No se pudo guardar el álbum. Los datos del formulario se conservan; vuelve a intentar.',
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function chooseCandidate(candidate: AlbumCandidate) {
    if (locked.current || pending || audioBusy) return
    locked.current = true
    setBusy(true)
    setFailure('')
    try {
      const parsed = parseAlbumForm(values)
      if (!parsed.success) {
        setErrors(parsed.errors)
        return
      }
      const previous = snapshot.library.userAlbums.find(
        (row) => row.id === candidate.activeEntryId,
      )
      const entry = await library.addAlbumToLibrary(
        candidate.album.id,
        linksInputFrom(values.personalLinks),
        previous ? personalLinksFrom(previous) : undefined,
        audio.dirty ? audio.value : undefined,
      )
      const committed = { id: entry.id, existing: true }
      audio.accept(entry.id)
      setPending(committed)
      await synchronize(committed)
    } catch (error) {
      setLinksConflict(
        error instanceof MusicUseCaseError && error.code === 'outdated_links',
      )
      setFailure(
        error instanceof AudioError
          ? error.message
          : error instanceof MusicUseCaseError &&
              error.code === 'outdated_links'
            ? error.message
            : 'No se pudo abrir o añadir el álbum seleccionado. Tu formulario se conserva; vuelve a intentar.',
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
  async function refreshCandidates() {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await onCommitted()
      setReview([])
      setFailure(
        'Datos actualizados. Tu formulario se conserva; guarda para revisar de nuevo las coincidencias.',
      )
      setLinksConflict(false)
    } catch {
      setFailure(
        'No pudimos actualizar las coincidencias. Tu formulario se conserva; vuelve a intentar.',
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function synchronize(committed: { id: string; existing: boolean }) {
    try {
      await onCommitted()
      onComplete(committed.id, committed.existing)
    } catch {
      setFailure(
        'El álbum se guardó, pero no pudimos actualizar la biblioteca. Reintenta sólo la lectura para continuar.',
      )
    }
  }
  async function retryRead() {
    if (locked.current || !pending) return
    locked.current = true
    setBusy(true)
    await synchronize(pending)
    setBusy(false)
    locked.current = false
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
        <fieldset
          disabled={busy || Boolean(pending)}
          className="album-form-fields"
        >
          <div className="form-grid">
            <label>
              <span id="form-artist-label" className="field-label">
                Artista <span aria-hidden="true">*</span>
              </span>
              <CatalogNameInput
                ref={artistRef}
                name="artist"
                options={values.catalogArtists ? [] : suggestions.artists}
                suggestionsLabel="Artistas del catálogo local"
                aria-labelledby="form-artist-label"
                required
                value={values.catalogArtists?.join(' · ') ?? values.artist}
                aria-invalid={Boolean(errors.artist)}
                aria-describedby={errors.artist ? 'error-artist' : undefined}
                onChange={(name) =>
                  edit({
                    artist: name,
                    artistId: undefined,
                    newArtistConfirmed: false,
                  })
                }
                onChoose={(option) => {
                  const artist = snapshot.catalog.artists.find(
                    (row) => row.id === option.id,
                  )!
                  edit({
                    artist: artist.name,
                    artistId: artist.id,
                    newArtistConfirmed: false,
                    country: artist.country ?? '',
                  })
                }}
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
            artist={values.catalogArtists?.join(' · ') ?? values.artist}
            onSelect={selectCatalogCandidate}
            onManual={() => saveHeading.current?.focus()}
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
                        coverImage: undefined,
                      })
                    }
                  />
                  <span>
                    Guardar enlace de portada de Cover Art Archive (puede no
                    estar disponible). Se mostrará automáticamente.
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
          {!values.catalogArtists ? (
            <ArtistReuseChoice
              snapshot={snapshot}
              name={values.artist}
              selectedId={values.artistId}
              confirmedNew={values.newArtistConfirmed}
              onChange={(id) => {
                const artist = snapshot.catalog.artists.find(
                  (row) => row.id === id,
                )
                edit({
                  artistId: id,
                  newArtistConfirmed: !id,
                  ...(artist
                    ? { artist: artist.name, country: artist.country ?? '' }
                    : {}),
                })
              }}
            />
          ) : null}
          <button
            type="button"
            className="text-button"
            disabled={(values.catalogArtists?.length ?? 1) >= 50}
            onClick={() => {
              const credits = values.catalogArtists ?? [values.artist]
              edit({
                catalogArtists: [...credits, ''],
                catalogArtistIds: [
                  ...(values.catalogArtistIds ?? [values.artistId]),
                  undefined,
                ],
                catalogArtistConfirmed: [
                  ...(values.catalogArtistConfirmed ?? [
                    values.newArtistConfirmed,
                  ]),
                  false,
                ],
                catalogCountries: [
                  ...(values.catalogCountries ?? [values.country]),
                  '',
                ],
                catalogReference: undefined,
              })
              const details =
                formRef.current?.querySelector<HTMLDetailsElement>(
                  'details.album-details',
                )
              if (details) details.open = true
              requestAnimationFrame(() =>
                formRef.current
                  ?.querySelector<HTMLInputElement>(
                    `[name="credit-name-${credits.length}"]`,
                  )
                  ?.focus(),
              )
            }}
          >
            Añadir otro artista
          </button>
          <details className="optional-fields album-details">
            <summary>Detalles del álbum (opcionales)</summary>
            <div className="mt-5 grid gap-5">
              <AlbumClassificationFields value={values} onChange={edit} />
              <label>
                <span id="form-genres-label" className="field-label">
                  Géneros (separados por comas)
                </span>
                <CatalogNameInput
                  name="genres"
                  aria-labelledby="form-genres-label"
                  genres
                  options={suggestions.genres}
                  suggestionsLabel="Géneros del catálogo local"
                  value={values.genres}
                  onChange={(genres) => edit({ genres })}
                  aria-invalid={Boolean(errors.genres)}
                  aria-describedby={errors.genres ? 'error-genres' : undefined}
                  placeholder="Rock, jazz, metal…"
                />
                {errorFor('genres')}
              </label>
              {values.catalogArtists ? (
                values.catalogArtists.map((name, index) => (
                  <div key={index}>
                    <label>
                      <span
                        id={`credit-label-${index}`}
                        className="field-label"
                      >
                        Nombre del artista {index + 1}
                      </span>
                      <CatalogNameInput
                        name={`credit-name-${index}`}
                        aria-labelledby={`credit-label-${index}`}
                        options={suggestions.artists}
                        suggestionsLabel={`Artistas del catálogo local ${index + 1}`}
                        value={name}
                        onChange={(name) => {
                          const names = [...values.catalogArtists!]
                          names[index] = name
                          const ids = [
                            ...(values.catalogArtistIds ??
                              names.map(() => undefined)),
                          ]
                          ids[index] = undefined
                          const confirmations = [
                            ...(values.catalogArtistConfirmed ??
                              names.map(() => false)),
                          ]
                          confirmations[index] = false
                          edit({
                            catalogArtists: names,
                            catalogArtistIds: ids,
                            catalogArtistConfirmed: confirmations,
                            catalogReference: undefined,
                          })
                        }}
                        onChoose={(option) => {
                          const artist = snapshot.catalog.artists.find(
                            (row) => row.id === option.id,
                          )!
                          const names = [...values.catalogArtists!]
                          const ids = [
                            ...(values.catalogArtistIds ??
                              names.map(() => undefined)),
                          ]
                          const confirmations = [
                            ...(values.catalogArtistConfirmed ??
                              names.map(() => false)),
                          ]
                          const countries = [
                            ...(values.catalogCountries ?? names.map(() => '')),
                          ]
                          names[index] = artist.name
                          ids[index] = artist.id
                          confirmations[index] = false
                          countries[index] = artist.country ?? ''
                          edit({
                            catalogArtists: names,
                            catalogArtistIds: ids,
                            catalogArtistConfirmed: confirmations,
                            catalogCountries: countries,
                            catalogReference: undefined,
                          })
                        }}
                      />
                    </label>
                    <ArtistReuseChoice
                      snapshot={snapshot}
                      name={name}
                      selectedId={values.catalogArtistIds?.[index]}
                      confirmedNew={
                        values.catalogArtistConfirmed?.[index] ?? false
                      }
                      onChange={(id) => {
                        const ids = [
                          ...(values.catalogArtistIds ??
                            values.catalogArtists!.map(() => undefined)),
                        ]
                        ids[index] = id
                        const confirmations = [
                          ...(values.catalogArtistConfirmed ??
                            values.catalogArtists!.map(() => false)),
                        ]
                        confirmations[index] = !id
                        edit({
                          catalogArtistIds: ids,
                          catalogArtistConfirmed: confirmations,
                        })
                      }}
                    />
                    <label>
                      <span className="field-label">
                        País de origen de {name}
                      </span>
                      <input
                        name={`country-${index}`}
                        disabled={Boolean(values.catalogArtistIds?.[index])}
                        maxLength={100}
                        value={
                          snapshot.catalog.artists.find(
                            (artist) =>
                              artist.id === values.catalogArtistIds?.[index],
                          )?.country ??
                          values.catalogCountries?.[index] ??
                          ''
                        }
                        onChange={(event) => {
                          const countries = [
                            ...(values.catalogCountries ??
                              values.catalogArtists!.map(() => '')),
                          ]
                          countries[index] = event.target.value
                          edit({ catalogCountries: countries })
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      disabled={values.catalogArtists!.length < 2}
                      onClick={() =>
                        edit({
                          catalogArtists: values.catalogArtists!.filter(
                            (_, row) => row !== index,
                          ),
                          catalogArtistIds: values.catalogArtistIds?.filter(
                            (_, row) => row !== index,
                          ),
                          catalogArtistConfirmed:
                            values.catalogArtistConfirmed?.filter(
                              (_, row) => row !== index,
                            ),
                          catalogCountries: (
                            values.catalogCountries ??
                            values.catalogArtists!.map(() => '')
                          ).filter((_, row) => row !== index),
                          catalogReference: undefined,
                        })
                      }
                    >
                      Quitar artista {index + 1}
                    </button>
                  </div>
                ))
              ) : (
                <label>
                  <span className="field-label">
                    País de origen de la banda o artista
                  </span>
                  <input
                    name="country"
                    maxLength={100}
                    value={values.country}
                    disabled={values.artistId !== undefined}
                    onChange={(event) => edit({ country: event.target.value })}
                    aria-invalid={Boolean(errors.country)}
                    aria-describedby={
                      errors.country ? 'error-country' : undefined
                    }
                  />
                  {values.artistId ? (
                    <span className="mt-2 block text-xs text-muted">
                      País del artista seleccionado. Puedes corregirlo desde la
                      edición de una ficha.
                    </span>
                  ) : null}
                </label>
              )}
              {errorFor('country')}
              <PersonalLinksEditor
                value={values.personalLinks}
                onChange={(personalLinks) => edit({ personalLinks })}
                {...(errors.personalLinks
                  ? { error: errors.personalLinks }
                  : {})}
              />
              <CoverFields
                url={values.coverUrl}
                {...(values.coverImage ? { image: values.coverImage } : {})}
                onChange={edit}
                disabled={busy}
                onBusyChange={setCoverBusy}
                {...(errors.coverUrl || errors.coverImage
                  ? { error: errors.coverUrl ?? errors.coverImage }
                  : {})}
              />
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
            </div>
          </details>
          {library.audio ? (
            <details className="optional-fields">
              <summary>Archivos de audio propios (opcional)</summary>
              <AudioEditor
                value={audio.value}
                onChange={audio.set}
                service={library.audio}
                tracks={[]}
                disabled={busy}
                onBusyChange={setAudioBusy}
                outside={audio.value.outside}
                ready={audio.ready}
                error={audio.value.error}
                onReload={audio.reload}
              />
            </details>
          ) : null}
          <h3 ref={saveHeading} tabIndex={-1} className="font-semibold">
            Revisar y guardar
          </h3>
          <p className="text-sm text-muted">
            {(values.catalogArtists?.join(' · ') ?? values.artist) ||
              'Artista pendiente'}{' '}
            · {values.title || 'Título pendiente'} ·{' '}
            {classificationLabel(values)}. Podrás calificarlo y añadir ediciones
            desde su ficha.
          </p>
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
                Coincidencias en tu catálogo local
              </h3>
              <p className="mt-2 text-sm text-muted" role="status">
                Comprueba si es el mismo álbum. Ningún registro se ha creado ni
                fusionado.
                {values.personalLinks.links.length
                  ? ' Al elegir una coincidencia se añadirán tus enlaces sin borrar los anteriores; el favorito elegido aquí sustituirá la preferencia anterior.'
                  : ''}
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
                      {classificationLabel(candidate.album)} ·{' '}
                      {candidate.album.originalYear ?? 'Sin año'}
                    </p>
                    <button
                      type="button"
                      className="action-button mt-3"
                      onClick={() => {
                        void chooseCandidate(candidate)
                      }}
                    >
                      {values.personalLinks.links.length
                        ? 'Usar este álbum y añadir mis enlaces'
                        : candidate.activeEntryId
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
          {failure && !pending ? (
            <p role="alert" className="field-error">
              {failure}
            </p>
          ) : null}
          {linksConflict ? (
            <button
              type="button"
              className="action-button"
              onClick={() => void refreshCandidates()}
            >
              Actualizar coincidencias conservando formulario
            </button>
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
              <button
                type="submit"
                className="primary-button"
                disabled={coverBusy || audioBusy}
              >
                Guardar álbum
              </button>
            ) : null}
            <button type="button" className="action-button" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </fieldset>
      </form>
      {pending ? (
        <>
          <p role="alert" className="field-error">
            {failure}
          </p>
          <button
            ref={retry}
            type="button"
            className="action-button mt-4"
            disabled={busy}
            onClick={() => void retryRead()}
          >
            Reintentar lectura del álbum
          </button>
        </>
      ) : null}
    </section>
  )
}
