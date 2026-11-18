const mbid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function musicBrainzUrl(endpoint, params) {
  const upstream = new URL(`https://musicbrainz.org/ws/2/${endpoint}/`)
  upstream.searchParams.set('fmt', 'json')
  if (
    endpoint === 'artist' &&
    [...params.keys()].every((key) => key === 'query')
  ) {
    const value = params.get('query')?.trim() ?? ''
    if (!value || value.length > 120 || params.getAll('query').length !== 1) {
      return
    }
    upstream.searchParams.set(
      'query',
      `artist:"${value.replace(/[\\"]/g, '\\$&')}"`,
    )
    upstream.searchParams.set('limit', '12')
  } else if (
    endpoint === 'release-group' &&
    [...params.keys()].every((key) => key === 'artist' || key === 'offset')
  ) {
    const artist = params.get('artist') ?? ''
    const offset = params.get('offset') ?? '0'
    if (
      !mbid.test(artist) ||
      !/^(0|[1-9]\d{0,4})$/.test(offset) ||
      params.getAll('artist').length !== 1 ||
      params.getAll('offset').length > 1
    ) {
      return
    }
    upstream.searchParams.set('artist', artist.toLowerCase())
    upstream.searchParams.set('offset', offset)
    upstream.searchParams.set('limit', '100')
    upstream.searchParams.set('inc', 'artist-credits')
  } else if (
    endpoint === 'release' &&
    [...params.keys()].every((key) => key === 'group' || key === 'offset')
  ) {
    const group = params.get('group') ?? ''
    const offset = params.get('offset') ?? '0'
    if (
      !mbid.test(group) ||
      !/^(0|[1-9]\d{0,4})$/.test(offset) ||
      params.getAll('group').length !== 1 ||
      params.getAll('offset').length > 1
    ) {
      return
    }
    upstream.searchParams.set('release-group', group.toLowerCase())
    upstream.searchParams.set('offset', offset)
    upstream.searchParams.set('limit', '100')
    upstream.searchParams.set('inc', 'labels+media')
  } else if (
    /^release\/[0-9a-f-]+$/i.test(endpoint) &&
    mbid.test(endpoint.slice(8)) &&
    ![...params.keys()].length
  ) {
    upstream.searchParams.set('inc', 'recordings+release-groups+labels')
  } else {
    return
  }
  return upstream
}
