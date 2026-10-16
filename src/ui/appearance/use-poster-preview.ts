import { useCallback, useEffect, useRef, useState } from 'react'

export type PosterPosition = 'left' | 'center' | 'right'

export type Poster = {
  url: string
  opacity: number
  position: PosterPosition
}

export const MAX_POSTER_BYTES = 5 * 1024 * 1024
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function hasRasterSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (file.type === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (file.type === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    )
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

type PendingImage = {
  url: string
  cancel: () => void
}

export function usePosterPreview() {
  const [poster, setPoster] = useState<Poster | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const attempt = useRef(0)
  const displayedUrl = useRef<string | null>(null)
  const pending = useRef<PendingImage | null>(null)

  const cancelPending = useCallback(() => {
    const candidate = pending.current
    pending.current = null
    if (candidate) {
      candidate.cancel()
      URL.revokeObjectURL(candidate.url)
    }
  }, [])

  const releaseDisplayed = useCallback(() => {
    if (displayedUrl.current) {
      URL.revokeObjectURL(displayedUrl.current)
      displayedUrl.current = null
    }
  }, [])

  useEffect(
    () => () => {
      attempt.current += 1
      cancelPending()
      releaseDisplayed()
    },
    [cancelPending, releaseDisplayed],
  )

  const chooseFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      const selection = ++attempt.current
      cancelPending()
      setError(null)
      setPreparing(false)
      if (!MIME_TYPES.has(file.type)) {
        setError('Elige una imagen PNG, JPEG o WebP.')
        return
      }
      if (file.size === 0 || file.size > MAX_POSTER_BYTES) {
        setError('La imagen debe ocupar entre 1 byte y 5 MiB.')
        return
      }

      setPreparing(true)
      let candidateUrl: string | null = null
      try {
        const raster = await hasRasterSignature(file)
        if (selection !== attempt.current) return
        if (!raster) {
          setError('El archivo no contiene una imagen PNG, JPEG o WebP válida.')
          return
        }
        candidateUrl = URL.createObjectURL(file)
        const url = candidateUrl
        const loaded = await new Promise<boolean>((resolve) => {
          const image = new Image()
          const finish = (valid: boolean) => {
            image.onload = null
            image.onerror = null
            resolve(valid)
          }
          pending.current = { url, cancel: () => finish(false) }
          image.onload = () =>
            finish(image.naturalWidth > 0 && image.naturalHeight > 0)
          image.onerror = () => finish(false)
          image.src = url
        })
        if (selection !== attempt.current) return
        pending.current = null
        if (!loaded) {
          URL.revokeObjectURL(url)
          candidateUrl = null
          setError('No pudimos abrir esta imagen. Prueba con otro archivo.')
          return
        }
        releaseDisplayed()
        displayedUrl.current = url
        candidateUrl = null
        setPoster({ url, opacity: 0.12, position: 'center' })
      } catch {
        if (candidateUrl) {
          if (pending.current?.url === candidateUrl) {
            pending.current.cancel()
            pending.current = null
          }
          URL.revokeObjectURL(candidateUrl)
        }
        if (selection === attempt.current) {
          setError('No pudimos abrir esta imagen. Prueba con otro archivo.')
        }
      } finally {
        if (selection === attempt.current) setPreparing(false)
      }
    },
    [cancelPending, releaseDisplayed],
  )

  function removePoster() {
    attempt.current += 1
    cancelPending()
    releaseDisplayed()
    setPoster(null)
    setError(null)
    setPreparing(false)
  }

  return {
    poster,
    error,
    preparing,
    chooseFile,
    removePoster,
    setOpacity(value: number) {
      if (!Number.isFinite(value)) return
      const opacity = Math.min(0.25, Math.max(0.05, value))
      setPoster((current) => (current ? { ...current, opacity } : null))
    },
    setPosition(position: PosterPosition) {
      setPoster((current) => (current ? { ...current, position } : null))
    },
  }
}

export type PosterPreview = ReturnType<typeof usePosterPreview>
