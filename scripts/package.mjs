import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
)
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version)) {
  throw new Error('Invalid package version')
}
const releases = resolve(root, 'release')
const output = resolve(releases, `auditorium-${version}`)
if (!output.startsWith(releases + sep) || dirname(output) !== releases) {
  throw new Error('Invalid package output')
}
// Rebuild only this generated candidate, never source files or user storage.
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(root, 'dist'), join(output, 'site'), { recursive: true })
await cp(join(root, 'docs', 'ENTREGA_MVP.md'), join(output, 'ENTREGA_MVP.md'))
await cp(join(root, 'CHANGELOG.md'), join(output, 'CHANGELOG.md'))
await cp(
  join(root, 'docs', 'VALIDACION_MVP.md'),
  join(output, 'VALIDACION_MVP.md'),
)

const runtimePackages = [
  'react',
  'react-dom',
  'scheduler',
  'dexie',
  'zod',
  'vite',
  'rolldown',
  'workbox-core',
  'workbox-precaching',
  'workbox-routing',
  'workbox-strategies',
  'workbox-cacheable-response',
  'workbox-expiration',
]
const notices = [
  '# Avisos de dependencias\n\nLicencias y avisos de los componentes que pueden aportar código al paquete de producción.\n',
]
for (const name of runtimePackages) {
  const directory = join(root, 'node_modules', name)
  const metadata = JSON.parse(
    await readFile(join(directory, 'package.json'), 'utf8'),
  )
  notices.push(`\n## ${name} ${metadata.version} (${metadata.license})\n`)
  const files = (await readdir(directory))
    .filter((name) =>
      /^(?:LICENSE(?:\.txt|\.md)?|NOTICE|THIRD-PARTY-LICENSE)$/i.test(name),
    )
    .sort()
  if (!files.length) throw new Error(`Missing license for ${name}`)
  for (const file of files) {
    notices.push(
      `\n### ${file}\n\n${await readFile(join(directory, file), 'utf8')}\n`,
    )
  }
}
await writeFile(join(output, 'THIRD_PARTY_NOTICES.md'), notices.join(''))

async function inventory(directory, prefix = '') {
  const files = []
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name)
    const relative = prefix + entry.name
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links cannot be packaged')
    if (entry.isDirectory())
      files.push(...(await inventory(path, relative + '/')))
    else if (entry.isFile()) {
      const content = await readFile(path)
      files.push({
        path: relative,
        bytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      })
    }
  }
  return files
}
const files = await inventory(output)
for (const required of [
  'site/index.html',
  'site/sw.js',
  'site/manifest.webmanifest',
]) {
  if (!files.some((file) => file.path === required))
    throw new Error(`Missing ${required}`)
}
if (
  files.some((file) =>
    /(?:^|\/)(?:\.env[^/]*|agents|node_modules|test-results|auditorium-[^/]*\.json)(?:\/|$)/i.test(
      file.path,
    ),
  )
) {
  throw new Error('Unexpected private or development content')
}
await writeFile(
  join(output, 'CONTENTS.json'),
  JSON.stringify({ name: 'auditorium', version, files }, null, 2) + '\n',
)
console.log(
  `Package prepared: release/auditorium-${version} (${files.length} files plus inventory)`,
)
