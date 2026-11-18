import type { IncomingMessage, ServerResponse } from 'node:http'

export function createMusicBrainzProxy(options?: {
  fetchImpl?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  cacheMs?: number
  origins?: string[]
}): (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => Promise<void>
