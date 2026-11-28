import { useCallback, useEffect, useRef, useState } from 'react'
import type { Wallpaper } from '../../domain/personal-design'
import {
  MAX_WALLPAPER_BYTES,
  prepareWallpaper,
  WallpaperError,
} from '../../infrastructure/browser/wallpaper'
import { usePersonalDesign } from './personal-design-context'

export type PosterPosition = Wallpaper['position']
export type Poster = Wallpaper
export const MAX_POSTER_BYTES = MAX_WALLPAPER_BYTES
export function usePosterPreview() {
  const { design, update } = usePersonalDesign()
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const cancel = useCallback(() => {
    pending.current?.abort()
    pending.current = null
  }, [])
  useEffect(() => cancel, [cancel])
  const chooseFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      cancel()
      const controller = new AbortController()
      pending.current = controller
      setError(null)
      setPreparing(true)
      try {
        const wallpaper = await prepareWallpaper(file, controller.signal)
        controller.signal.throwIfAborted()
        update((current) => ({ ...current, wallpaper }), false)
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof WallpaperError
              ? failure.message
              : 'No pudimos abrir esta imagen.',
          )
      } finally {
        if (pending.current === controller) {
          pending.current = null
          setPreparing(false)
        }
      }
    },
    [cancel, update],
  )
  return {
    poster: design.wallpaper,
    error,
    preparing,
    chooseFile,
    cancelSelection() {
      cancel()
      setPreparing(false)
      setError(null)
    },
    removePoster() {
      cancel()
      setPreparing(false)
      setError(null)
      update((current) => ({ ...current, wallpaper: null }), false)
    },
    setOpacity(value: number) {
      if (!Number.isFinite(value)) return
      const opacity = Math.min(0.6, Math.max(0.1, value))
      update((current) => ({
        ...current,
        wallpaper: current.wallpaper ? { ...current.wallpaper, opacity } : null,
      }))
    },
    setPosition(position: PosterPosition) {
      update((current) => ({
        ...current,
        wallpaper: current.wallpaper
          ? { ...current.wallpaper, position }
          : null,
      }))
    },
  }
}
export type PosterPreview = ReturnType<typeof usePosterPreview>
