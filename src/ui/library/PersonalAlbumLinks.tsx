import type { UserAlbum } from '../../domain/library/schemas'
import { linkProvider } from '../../domain/library/personal-links'
import { useState } from 'react'
import { inspectPlaybackLink } from '../../infrastructure/streaming/playback-links'
import { StreamingPlayer } from './StreamingPlayer'

export function PersonalAlbumLinks({
  entry,
  onEdit,
  disabled,
}: {
  entry: UserAlbum
  onEdit: () => void
  disabled: boolean
}) {
  const hasLinks = Boolean(entry.links?.length)
  const playback = (entry.links ?? []).filter(
    (link) => link.purpose === 'playback',
  )
  const [chosenId, setChosenId] = useState(
    entry.preferredPlaybackLinkId ?? playback[0]?.id,
  )
  const chosen = playback.find((link) => link.id === chosenId)
  const target = chosen ? inspectPlaybackLink(chosen.url) : undefined
  return (
    <section
      className="catalog-links personal-album-links"
      aria-label="Tus enlaces personales"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Tus enlaces personales</h3>
        <button
          id="album-links-edit-button"
          type="button"
          className="text-button"
          onClick={(event) => {
            event.currentTarget.focus()
            onEdit()
          }}
          disabled={disabled}
        >
          Editar enlaces
        </button>
      </div>
      {chosen ? (
        <section
          className="playback-choice"
          aria-label="Reproducir desde un enlace"
        >
          <label className="field-label" htmlFor="album-playback-choice">
            Enlace para escuchar
          </label>
          <select
            id="album-playback-choice"
            value={chosen.id}
            disabled={disabled}
            onChange={(event) => setChosenId(event.target.value)}
          >
            {playback.map((link) => (
              <option key={link.id} value={link.id}>
                {link.label ?? linkProvider(link.url)}
                {link.id === entry.preferredPlaybackLinkId ? ' · Favorito' : ''}
              </option>
            ))}
          </select>
          <a
            className="text-button mt-3 inline-flex min-h-11 items-center"
            href={chosen.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Abrir en el servicio: {linkProvider(chosen.url)}
          </a>
          {target ? (
            <StreamingPlayer
              key={chosen.id + chosen.url}
              target={target}
              disabled={disabled}
            />
          ) : (
            <p className="mt-3 text-sm text-muted">
              Este enlace se escucha en el servicio externo. Puedes guardarlo y
              editar la ficha aunque no tenga reproductor integrado.
            </p>
          )}
        </section>
      ) : null}
      {hasLinks ? (
        <div className="personal-links-groups">
          {(['playback', 'purchase'] as const).map((purpose) => {
            const links = (entry.links ?? [])
              .filter((link) => link.purpose === purpose)
              .toSorted(
                (a, b) =>
                  Number(b.id === entry.preferredPlaybackLinkId) -
                  Number(a.id === entry.preferredPlaybackLinkId),
              )
            return (
              <section
                key={purpose}
                aria-label={purpose === 'playback' ? 'Escuchar' : 'Comprar'}
              >
                <h4 className="font-semibold">
                  {purpose === 'playback' ? 'Escuchar' : 'Comprar'}
                </h4>
                {links.length ? (
                  <ul className="mt-3 grid gap-3">
                    {links.map((link) => (
                      <li key={link.id}>
                        <a
                          className="text-button inline-flex min-h-11 items-center gap-2"
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          {link.label ?? `Abrir en ${linkProvider(link.url)}`}
                          {link.id === entry.preferredPlaybackLinkId ? (
                            <span className="personal-link-favorite">
                              Favorito de reproducción
                            </span>
                          ) : null}
                        </a>
                        {link.label ? (
                          <p className="text-xs text-muted wrap-anywhere">
                            {linkProvider(link.url)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    {purpose === 'playback'
                      ? 'Aún no has guardado enlaces de escucha.'
                      : 'Aún no has guardado enlaces de compra.'}
                  </p>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Añade tus enlaces para escuchar o comprar este álbum.
        </p>
      )}
      {hasLinks ? (
        <p className="mt-4 text-xs text-muted">
          Guardar, abrir o reproducir un enlace no cambia tu nota, estado de
          escucha ni adquisiciones.
        </p>
      ) : null}
    </section>
  )
}
