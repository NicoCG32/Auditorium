import { useEffect } from 'react'
import type { LocalAudio } from '../../application/local-audio'
import {
  AudioError,
  audioAttachmentSchema,
  audioDraftDirty,
  audioItem,
  audioScope,
  type AudioAttachment,
  type AudioDraft,
} from '../../domain/audio'
import type { LocalIdentity } from '../../domain/identity'
import { useDraftState } from '../navigation/draft-context'

interface AudioState extends AudioDraft {
  loaded: boolean
  error: string
  outside: AudioAttachment[]
}
export function useAudioDraft(
  id: string,
  identity: LocalIdentity,
  service: LocalAudio | undefined,
  entryId?: string,
) {
  const scope = audioScope(identity)
  const [state, setState] = useDraftState<AudioState>(
    id,
    `audio:${scope}:${entryId ?? 'new'}`,
    () => ({
      scope,
      base: [],
      items: [],
      loaded: !service,
      error: '',
      outside: [],
    }),
  )
  useEffect(() => {
    if (!service || state.loaded || state.error) return
    let active = true
    void service
      .list()
      .then((rows) => {
        if (!active) return
        if (rows.some((row) => row.scope !== scope))
          throw new AudioError(
            'scope',
            'La identidad de la biblioteca cambió. Vuelve a abrir el formulario.',
          )
        const base = rows.filter((row) => row.userAlbumId === entryId)
        setState({
          scope,
          base,
          items: base.map(audioItem),
          loaded: true,
          error: '',
          outside: rows.filter((row) => row.userAlbumId !== entryId),
        })
      })
      .catch((error: unknown) => {
        if (active)
          setState((previous) => ({
            ...previous,
            error:
              error instanceof Error
                ? error.message
                : 'No se pudieron leer los adjuntos locales.',
          }))
      })
    return () => {
      active = false
    }
  }, [service, state.loaded, state.error, scope, entryId, setState])
  return {
    value: state,
    ready: state.loaded && !state.error,
    dirty: audioDraftDirty(state),
    set: (draft: AudioDraft) =>
      setState((previous) => ({ ...previous, ...draft })),
    accept: (entry: string) =>
      setState((previous) => {
        const base = previous.items.map((item) =>
          audioAttachmentSchema.parse({
            ...audioItem(item),
            scope: previous.scope,
            userAlbumId: entry,
          }),
        )
        return { ...previous, base, items: base.map(audioItem) }
      }),
    reload: () =>
      setState((previous) => ({
        ...previous,
        base: [],
        items: [],
        loaded: false,
        error: '',
      })),
  }
}
