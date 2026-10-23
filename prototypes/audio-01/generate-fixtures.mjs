import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('./fixtures/', import.meta.url))
await mkdir(output, { recursive: true })
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH
    ? join(
        dirname(ffmpeg),
        process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
      )
    : 'ffprobe')
const formats = [
  ['wav-pcm', 'wav', 'audio/wav', 'pcm_s16le', []],
  ['mp3', 'mp3', 'audio/mpeg', 'libmp3lame', ['-b:a', '128k']],
  ['flac', 'flac', 'audio/flac', 'flac', []],
  [
    'ogg-vorbis',
    'ogg',
    'audio/ogg; codecs="vorbis"',
    'libvorbis',
    ['-q:a', '3'],
  ],
  ['ogg-opus', 'opus', 'audio/ogg; codecs="opus"', 'libopus', ['-b:a', '64k']],
  [
    'webm-opus',
    'webm',
    'audio/webm; codecs="opus"',
    'libopus',
    ['-b:a', '64k'],
  ],
  ['mp4-aac', 'm4a', 'audio/mp4; codecs="mp4a.40.2"', 'aac', ['-b:a', '128k']],
  ['adts-aac', 'aac', 'audio/aac', 'aac', ['-b:a', '128k']],
]
const manifest = {
  source:
    'Synthetic sine, 440 Hz, 48000 Hz mono, 1.2 s, volume factor 0.03. No recordings or musical works.',
  license: 'CC0-1.0',
  generator: execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split(
    /\r?\n/,
  )[0],
  files: [],
}
for (const [id, extension, mime, encoder, extra] of formats) {
  const file = `tone-${id}.${extension}`,
    path = join(output, file)
  execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=1.2',
      '-af',
      'volume=0.03',
      '-map_metadata',
      '-1',
      '-c:a',
      encoder,
      ...extra,
      path,
    ],
    { stdio: 'pipe' },
  )
  const bytes = await readFile(path)
  const metadata = JSON.parse(
    execFileSync(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,codec_type,sample_rate,channels:format=duration,format_name',
        '-of',
        'json',
        path,
      ],
      { encoding: 'utf8' },
    ),
  )
  manifest.files.push({
    id,
    file,
    mime,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    streams: metadata.streams,
    container: metadata.format.format_name,
    duration: Number(metadata.format.duration),
  })
}
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(`AUDIO-01 generated ${manifest.files.length} synthetic fixtures.`)
