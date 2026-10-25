import {
  AudioError,
  MAX_AUDIO_ARCHIVE_BYTES,
  MAX_AUDIO_FILE_BYTES,
  MAX_AUDIO_MANIFEST_BYTES,
} from '../../domain/audio'
import { MAX_BACKUP_BYTES } from '../../domain/backup'

// ZIP Store profile, APPNOTE 6.3.10 sections 4.3.7, 4.3.12 and 4.3.16.
const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function invalid(): never {
  throw new AudioError(
    'invalid_archive',
    'El ZIP no coincide con el formato de respaldo completo de Auditorium o está dañado.',
  )
}
function limit(name: string) {
  if (name === 'library.json') return MAX_BACKUP_BYTES
  if (name === 'audio-manifest.json') return MAX_AUDIO_MANIFEST_BYTES
  if (/^audio\/[a-f0-9-]{36}\.bin$/u.test(name)) return MAX_AUDIO_FILE_BYTES
  return invalid()
}
async function yieldToCancel(signal?: AbortSignal) {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  signal?.throwIfAborted()
}
export interface StoredZipEntry {
  name: string
  data: Uint8Array
}
export async function createStoredZip(
  entries: StoredZipEntry[],
  signal?: AbortSignal,
) {
  if (
    entries.length < 2 ||
    entries.length > 130 ||
    new Set(entries.map((entry) => entry.name)).size !== entries.length
  )
    invalid()
  let size = 22
  const records = entries.map((entry) => {
    if (entry.data.byteLength > limit(entry.name)) invalid()
    const name = encoder.encode(entry.name)
    size += 30 + 46 + name.byteLength * 2 + entry.data.byteLength
    return { ...entry, name }
  })
  if (size > MAX_AUDIO_ARCHIVE_BYTES)
    throw new AudioError(
      'limit',
      'El respaldo completo supera el máximo de 160 MiB.',
    )
  const output = new Uint8Array(size),
    view = new DataView(output.buffer)
  let cursor = 0
  const directory: {
    name: Uint8Array
    size: number
    crc: number
    offset: number
  }[] = []
  for (const entry of records) {
    await yieldToCancel(signal)
    const crc = crc32(entry.data),
      start = cursor
    view.setUint32(cursor, 0x04034b50, true)
    view.setUint16(cursor + 4, 20, true)
    view.setUint16(cursor + 6, 0x0800, true)
    view.setUint16(cursor + 12, 33, true)
    view.setUint32(cursor + 14, crc, true)
    view.setUint32(cursor + 18, entry.data.byteLength, true)
    view.setUint32(cursor + 22, entry.data.byteLength, true)
    view.setUint16(cursor + 26, entry.name.byteLength, true)
    output.set(entry.name, cursor + 30)
    cursor += 30 + entry.name.byteLength
    output.set(entry.data, cursor)
    cursor += entry.data.byteLength
    directory.push({
      name: entry.name,
      size: entry.data.byteLength,
      crc,
      offset: start,
    })
  }
  const directoryOffset = cursor
  for (const entry of directory) {
    view.setUint32(cursor, 0x02014b50, true)
    view.setUint16(cursor + 4, 20, true)
    view.setUint16(cursor + 6, 20, true)
    view.setUint16(cursor + 8, 0x0800, true)
    view.setUint16(cursor + 14, 33, true)
    view.setUint32(cursor + 16, entry.crc, true)
    view.setUint32(cursor + 20, entry.size, true)
    view.setUint32(cursor + 24, entry.size, true)
    view.setUint16(cursor + 28, entry.name.byteLength, true)
    view.setUint32(cursor + 42, entry.offset, true)
    output.set(entry.name, cursor + 46)
    cursor += 46 + entry.name.byteLength
  }
  view.setUint32(cursor, 0x06054b50, true)
  view.setUint16(cursor + 8, directory.length, true)
  view.setUint16(cursor + 10, directory.length, true)
  view.setUint32(cursor + 12, cursor - directoryOffset, true)
  view.setUint32(cursor + 16, directoryOffset, true)
  signal?.throwIfAborted()
  return output
}
export async function readStoredZip(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > MAX_AUDIO_ARCHIVE_BYTES || bytes.byteLength < 22)
    invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    end = bytes.byteLength - 22
  const u16 = (offset: number) => {
    if (offset < 0 || offset + 2 > bytes.byteLength) invalid()
    return view.getUint16(offset, true)
  }
  const u32 = (offset: number) => {
    if (offset < 0 || offset + 4 > bytes.byteLength) invalid()
    return view.getUint32(offset, true)
  }
  if (
    u32(end) !== 0x06054b50 ||
    u16(end + 4) !== 0 ||
    u16(end + 6) !== 0 ||
    u16(end + 20) !== 0
  )
    invalid()
  const count = u16(end + 10),
    start = u32(end + 16),
    size = u32(end + 12)
  if (
    count < 2 ||
    count > 130 ||
    count !== u16(end + 8) ||
    start + size !== end
  )
    invalid()
  const records: {
    name: string
    nameBytes: Uint8Array
    size: number
    crc: number
    offset: number
    time: number
    date: number
    flags: number
    version: number
  }[] = []
  const names = new Set<string>()
  let cursor = start
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid()
    const flags = u16(cursor + 8),
      version = u16(cursor + 6),
      length = u16(cursor + 28)
    if (
      ![10, 20].includes(version) ||
      (flags !== 0 && flags !== 0x0800) ||
      u16(cursor + 10) !== 0 ||
      u16(cursor + 30) !== 0 ||
      u16(cursor + 32) !== 0 ||
      u16(cursor + 34) !== 0 ||
      u16(cursor + 36) !== 0 ||
      u32(cursor + 38) !== 0 ||
      cursor + 46 + length > end
    )
      invalid()
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + length)
    if (nameBytes.some((byte) => byte < 32 || byte > 126)) invalid()
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
    if (nameBytes.length !== encoder.encode(name).length || names.has(name))
      invalid()
    names.add(name)
    const entrySize = u32(cursor + 24)
    if (entrySize !== u32(cursor + 20) || entrySize > limit(name)) invalid()
    records.push({
      name,
      nameBytes,
      size: entrySize,
      crc: u32(cursor + 16),
      offset: u32(cursor + 42),
      time: u16(cursor + 12),
      date: u16(cursor + 14),
      flags,
      version,
    })
    cursor += 46 + length
  }
  if (cursor !== end) invalid()
  cursor = 0
  const result = new Map<string, Uint8Array>()
  for (const entry of records.sort((a, b) => a.offset - b.offset)) {
    await yieldToCancel(signal)
    if (
      entry.offset !== cursor ||
      cursor + 30 > start ||
      u32(cursor) !== 0x04034b50 ||
      u16(cursor + 4) !== entry.version ||
      u16(cursor + 6) !== entry.flags ||
      u16(cursor + 8) !== 0 ||
      u16(cursor + 10) !== entry.time ||
      u16(cursor + 12) !== entry.date ||
      u32(cursor + 14) !== entry.crc ||
      u32(cursor + 18) !== entry.size ||
      u32(cursor + 22) !== entry.size ||
      u16(cursor + 26) !== entry.nameBytes.length ||
      u16(cursor + 28) !== 0
    )
      invalid()
    const dataStart = cursor + 30 + entry.nameBytes.length
    if (
      dataStart + entry.size > start ||
      !entry.nameBytes.every(
        (byte, index) => bytes[cursor + 30 + index] === byte,
      )
    )
      invalid()
    const data = bytes.subarray(dataStart, dataStart + entry.size)
    if (crc32(data) !== entry.crc) invalid()
    result.set(entry.name, data)
    cursor = dataStart + entry.size
  }
  if (
    cursor !== start ||
    !result.has('library.json') ||
    !result.has('audio-manifest.json')
  )
    invalid()
  return result
}
