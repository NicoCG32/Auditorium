import type { UserAlbum } from '../../domain/library/schemas'
import { linkProvider } from '../../domain/library/personal-links'

export function PersonalAlbumLinks({
  entry,
  onEdit,
  disabled,
}: {
  entry: UserAlbum
  onEdit: () => void
  disabled: boolean
}) {
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
      <p className="mt-4 text-xs text-muted">
        Abren el servicio en otra pestaña. Guardar o abrir un enlace no cambia
        tu nota, estado de escucha ni adquisiciones.
      </p>
    </section>
  )
}
