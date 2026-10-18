import type { Album } from '../../domain/catalog/schemas'

export function AlbumReferenceLinks({
  album,
  artist,
}: {
  album: Album
  artist: string
}) {
  const reference = album.catalogReference
  const query = encodeURIComponent(`${artist} ${album.title}`)
  const links = [
    ...(reference
      ? [
          {
            label: `Wikidata · ${reference.entityId}`,
            url: `https://www.wikidata.org/wiki/${reference.entityId}`,
          },
        ]
      : []),
    ...(reference?.musicBrainzReleaseGroupId
      ? [
          {
            label: 'MusicBrainz · grupo de ediciones',
            url: `https://musicbrainz.org/release-group/${reference.musicBrainzReleaseGroupId}`,
          },
        ]
      : []),
    ...(reference?.spotifyAlbumIds?.map((id, index) => ({
      label: `Álbum en Spotify${reference.spotifyAlbumIds!.length > 1 ? ` · opción ${index + 1}` : ''}`,
      url: `https://open.spotify.com/album/${id}`,
    })) ?? []),
    ...(reference?.youtubeVideoIds?.map((id, index) => ({
      label: `Vídeo en YouTube${reference.youtubeVideoIds!.length > 1 ? ` · opción ${index + 1}` : ''}`,
      url: `https://www.youtube.com/watch?v=${id}`,
    })) ?? []),
    {
      label: 'Buscar en Spotify',
      url: `https://open.spotify.com/search/${query}`,
    },
    {
      label: 'Buscar en YouTube',
      url: `https://www.youtube.com/results?search_query=${query}`,
    },
  ]
  return (
    <section className="catalog-links" aria-label="Referencias y escucha">
      <h3 className="text-lg font-semibold">Referencias y escucha</h3>
      <p className="mt-2 text-sm text-muted">
        {reference
          ? `Referencia consultada el ${reference.retrievedAt.slice(0, 10)}. Los enlaces del catálogo pueden corresponder a distintas ediciones. `
          : ''}
        «Buscar» abre una búsqueda por título y artista; sus resultados no son
        coincidencias confirmadas.
      </p>
      <ul className="mt-3 grid gap-2">
        {links.map((link) => (
          <li key={link.url}>
            <a
              className="text-button inline-flex items-center"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
