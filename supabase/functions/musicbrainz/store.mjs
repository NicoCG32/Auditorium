/** Credentials stay in the function. Only these two RPCs are callable here. */
export function createCatalogStore(base, key, fetcher = fetch) {
  const project = new URL(base)
  if (project.protocol !== 'https:' || !key)
    throw new Error('Invalid catalog configuration')
  async function rpc(name, body) {
    const response = await fetcher(new URL(`/rest/v1/rpc/${name}`, project), {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Catalog coordination unavailable')
    return response.json()
  }
  return {
    enter: (requestId, cacheKey) =>
      rpc('musicbrainz_enter', { p_request_id: requestId, p_key: cacheKey }),
    leave: (requestId, cacheKey, body = null) =>
      rpc('musicbrainz_leave', {
        p_request_id: requestId,
        p_key: cacheKey,
        p_body: body,
      }),
  }
}
