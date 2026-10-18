/* global document, window */

// Boceto de revisión: datos ficticios en memoria, sin repositorio ni peticiones.
const albums = [
  {
    title: 'Umbral',
    artist: 'Círculo Norte',
    initials: 'CN',
    year: 2021,
    genre: 'Metal',
    country: 'Chile',
    score: 8.5,
    listening: 'Escuchado',
    tone: 'ember',
  },
  {
    title: 'El bosque interior',
    artist: 'Línea Boreal',
    initials: 'LB',
    year: 2024,
    genre: 'Post-rock',
    country: 'Finlandia',
    listening: 'Por escuchar',
    tone: 'forest',
  },
  {
    title: 'Cartas al invierno',
    artist: 'Azul Umbrío',
    initials: 'AU',
    year: 2019,
    genre: 'Metal',
    country: 'Argentina',
    score: 9,
    listening: 'Escuchando',
    tone: 'blue',
  },
  {
    title: 'Luz de otro tiempo',
    artist: 'El Faro Quieto',
    initials: 'FQ',
    year: 2022,
    genre: 'Jazz',
    country: 'Chile',
    score: 7.5,
    listening: 'Escuchado',
    tone: 'ochre',
  },
  {
    title: 'La forma del silencio',
    artist: 'Órbita Sur',
    initials: 'OS',
    year: 2025,
    genre: 'Post-rock',
    country: 'Argentina',
    listening: 'Escuchado',
    tone: 'plum',
  },
  {
    title: 'Donde termina el mar',
    artist: 'Senda de Sal',
    initials: 'SS',
    year: 2020,
    genre: 'Metal',
    country: 'Chile',
    score: 8,
    listening: 'Escuchado',
    tone: 'forest',
  },
  {
    title: 'Todo lo que queda',
    artist: 'Dos Horizontes',
    initials: 'DH',
    year: 2018,
    genre: 'Jazz',
    country: 'Argentina',
    score: 7,
    listening: 'Por escuchar',
    tone: 'blue',
  },
  {
    title: 'La estación perdida',
    artist: 'Niebla Serena',
    initials: 'NS',
    year: 2023,
    genre: 'Post-rock',
    country: 'Finlandia',
    listening: 'Por escuchar',
    tone: 'ochre',
  },
  {
    title: 'Un fuego pequeño',
    artist: 'Tierra Lenta',
    initials: 'TL',
    year: 2024,
    genre: 'Metal',
    country: 'Chile',
    score: 9.5,
    listening: 'Escuchado',
    tone: 'ember',
  },
]
const screens = [...document.querySelectorAll('[data-screen]')]
const notice = document.querySelector('#notice')
const dialog = document.querySelector('#preview-dialog')
let selectedAlbum = albums[0]
let ratingView = 'all'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function artwork(album) {
  const cover = element('div', `art ${album.tone}`)
  cover.setAttribute('aria-hidden', 'true')
  cover.append(element('span', '', album.initials))
  return cover
}
function scoreText(score) {
  return score === undefined ? 'Sin nota' : String(score).replace('.', ',')
}
function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
function selectAlbum(album) {
  selectedAlbum = album
  document.querySelectorAll('[data-demo-title]').forEach((node) => {
    node.textContent = album.title
  })
  document.querySelectorAll('[data-demo-artist]').forEach((node) => {
    node.textContent = album.artist
  })
  const hero = document.querySelector('.hero-cover')
  hero.className = `hero-cover art ${album.tone}`
  hero.querySelector('span').textContent = album.initials
  document.querySelector('.metadata').textContent =
    `${album.year} · ${album.country} · Álbum`
  document
    .querySelector('.tags')
    .replaceChildren(element('span', '', album.genre))
  document
    .querySelector('.experience-card .big-score')
    .replaceChildren(
      document.createTextNode(scoreText(album.score)),
      element('span', '', album.score === undefined ? '' : ' / 10'),
    )
  document
    .querySelector('.experience-card .big-score')
    .classList.toggle('unrated', album.score === undefined)
  document.querySelector(
    '.experience-card > div:nth-child(2) > p',
  ).textContent = album.listening
  document.querySelector('[data-screen="experiencia"] input').value =
    album.score === undefined ? '' : scoreText(album.score)
  document.querySelector('[data-screen="experiencia"] select').value =
    album.listening
  document.querySelector(
    '#experience-title',
  ).previousElementSibling.textContent = `${album.title} · ${album.artist}`
  document.querySelector('[data-screen="editar"] input[name="title"]').value =
    album.title
  document.querySelector('[data-screen="editar"] input[name="artist"]').value =
    album.artist
}
function albumLink(album) {
  const link = element('a', 'album-link')
  link.href = '#album'
  link.setAttribute('aria-label', `Abrir ${album.title}, de ${album.artist}`)
  link.addEventListener('click', () => selectAlbum(album))
  return link
}
function renderAlbums() {
  const search = normalize(document.querySelector('#search').value)
  const genre = document.querySelector('#genre').value
  const country = document.querySelector('#country').value
  const listening = document.querySelector('#listening').value
  const rating = document.querySelector('#score-filter').value
  const order = document.querySelector('#order').value
  const visible = albums.filter((album) => {
    return (
      normalize(
        `${album.title} ${album.artist} ${album.genre} ${album.country}`,
      ).includes(search) &&
      (!genre || album.genre === genre) &&
      (!country || album.country === country) &&
      (!listening || listening === album.listening) &&
      (!rating || (rating === 'rated') === (album.score !== undefined))
    )
  })
  if (order === 'title')
    visible.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  if (order === 'score')
    visible.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const grid = document.querySelector('#album-grid')
  grid.replaceChildren(
    ...visible.map((album) => {
      const card = element('article', 'album-card')
      const link = albumLink(album)
      link.append(
        artwork(album),
        element('h2', 'album-title', album.title),
        element('p', 'album-artist', album.artist),
      )
      const meta = element('div', 'album-meta')
      meta.append(
        element('span', '', `${album.year} · ${album.genre}`),
        element('span', 'score', scoreText(album.score)),
      )
      card.append(link, meta)
      return card
    }),
  )
  document.querySelector('#result-count').textContent =
    `${visible.length} de ${albums.length} álbumes`
  document.querySelector('#no-results').hidden = visible.length > 0
  const count = [genre, country, listening, rating].filter(Boolean).length
  document.querySelector('#filter-button').textContent = count
    ? `Filtros (${count})`
    : 'Filtros ☷'
}
function resetFilters() {
  for (const id of ['search', 'genre', 'country', 'listening', 'score-filter'])
    document.querySelector(`#${id}`).value = ''
  renderAlbums()
}
function renderRatings() {
  const search = normalize(document.querySelector('#rating-search').value)
  const visible = albums.filter(
    (album) =>
      normalize(`${album.title} ${album.artist}`).includes(search) &&
      (ratingView === 'all' ||
        (ratingView === 'rated') === (album.score !== undefined)),
  )
  document.querySelector('#ratings-list').replaceChildren(
    ...visible.map((album) => {
      const row = element('article', 'rating-row')
      const copy = element('div')
      copy.append(
        element('h2', '', album.title),
        element('p', '', album.artist),
      )
      const action = element(
        'a',
        'text-button',
        album.score === undefined ? 'Calificar →' : 'Recalificar →',
      )
      action.href = '#experiencia'
      action.setAttribute(
        'aria-label',
        `${album.score === undefined ? 'Calificar' : 'Recalificar'} ${album.title}`,
      )
      action.addEventListener('click', () => selectAlbum(album))
      row.append(
        artwork(album),
        copy,
        element('span', 'rating-value', scoreText(album.score)),
        action,
      )
      return row
    }),
  )
}
function renderScreen() {
  const requested = window.location.hash.slice(1) || 'biblioteca'
  if (requested === 'contenido') return
  const name = screens.some((screen) => screen.dataset.screen === requested)
    ? requested
    : 'biblioteca'
  screens.forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name
  })
  const nav =
    name === 'revision'
      ? 'anadir'
      : name === 'experiencia'
        ? 'calificaciones'
        : ['album', 'editar'].includes(name)
          ? 'biblioteca'
          : name
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === nav) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  const heading = document.querySelector(`[data-screen="${name}"] h1`)
  document.title = `${heading.textContent} — Boceto de Auditórium`
  heading.tabIndex = -1
  heading.focus({ preventScroll: true })
  window.scrollTo(0, 0)
}

const dialogs = {
  options: [
    'Más opciones',
    'Respaldos · Álbumes retirados · Apariencia · Aplicación y almacenamiento.',
    'Las compras digitales y los deseos anteriores siguen accesibles en «Adquisiciones y deseos».',
  ],
  catalog: [
    'Buscar una referencia',
    'En el producto se revisarán las coincidencias del catálogo antes de guardar. Si no aparece el álbum, el registro manual sigue disponible.',
    'Este boceto no consulta servicios. Cierra para continuar con los datos de ejemplo.',
  ],
  links: [
    'Enlaces de este álbum',
    'Cada enlace distingue Escuchar de Comprar. Puedes mantener varios servicios y elegir una fuente favorita de escucha.',
    'Añadir, editar o quitar un enlace no registra una copia ni modifica tu nota. Este boceto no guarda URLs.',
  ],
  listen: [
    'Tu fuente de escucha',
    'Escuchar abrirá el enlace elegido o un reproductor oficial compatible cuando se haya comprobado su soporte.',
    'Esta propuesta no reproduce contenido. Abrir la fuente no cambiará tu nota ni marcará el álbum como escuchado.',
  ],
  purchase: [
    'Dónde comprar',
    'Aquí se mostrarán tus enlaces de tiendas, separados de las fuentes de escucha.',
    'Abrir una tienda no registra una compra. La copia física se añade expresamente en Colección física.',
  ],
  copy: [
    'Registrar una copia física',
    'Elige álbum, formato y edición opcional (Deluxe, Especial, Aniversario…). Después completa condición, fecha de adquisición y notas de esa copia.',
    'Dos copias pueden compartir una edición; una edición digital puede existir sin copias físicas. Este boceto muestra un vinilo y un CD ficticios.',
  ],
  legacy: [
    'Adquisiciones y deseos',
    'Las compras digitales y los deseos existentes permanecen aquí. No se incluyen en el recuento de copias físicas.',
    'El cambio de menú no borra ni reclasifica tus registros.',
  ],
  draft: [
    '¿Qué quieres hacer con los cambios?',
    'El producto conservará tu borrador hasta guardar o decidir descartarlo. Este diálogo ilustra esa decisión; el boceto no escribe en la biblioteca.',
  ],
}
function showDialog(key) {
  const [title, ...paragraphs] = dialogs[key]
  document.querySelector('#dialog-title').textContent = title
  const content = document.querySelector('#dialog-content')
  content.replaceChildren(...paragraphs.map((text) => element('p', '', text)))
  const defaultClose = dialog.querySelector('.form-end')
  defaultClose.hidden = key === 'draft'
  if (key === 'draft') {
    const actions = element('div', 'form-end')
    for (const label of [
      'Guardar y salir',
      'Descartar cambios',
      'Seguir editando',
    ]) {
      const button = element(
        'button',
        label === 'Guardar y salir' ? 'button primary' : 'text-button',
        label,
      )
      button.type = 'button'
      button.addEventListener('click', () => {
        dialog.close()
        if (label !== 'Seguir editando') {
          window.location.hash = 'album'
          notice.textContent =
            'Interacción simulada. No se han guardado ni descartado datos reales.'
        }
      })
      actions.append(button)
    }
    content.append(actions)
  }
  dialog.showModal()
}

document.querySelector('.theme-button').addEventListener('click', (event) => {
  const light = document.documentElement.dataset.theme !== 'light'
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  event.currentTarget.setAttribute(
    'aria-label',
    `Cambiar a tema ${light ? 'oscuro' : 'claro'}`,
  )
})
document.querySelector('#filter-button').addEventListener('click', (event) => {
  const panel = document.querySelector('#filters')
  panel.hidden = !panel.hidden
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden))
})
for (const id of [
  'search',
  'genre',
  'country',
  'listening',
  'score-filter',
  'order',
])
  document.querySelector(`#${id}`).addEventListener('input', renderAlbums)
document.querySelector('#reset-filters').addEventListener('click', resetFilters)
document.querySelector('#show-all').addEventListener('click', resetFilters)
document.querySelectorAll('[data-rating-view]').forEach((button) =>
  button.addEventListener('click', () => {
    ratingView = button.dataset.ratingView
    document
      .querySelectorAll('[data-rating-view]')
      .forEach((other) =>
        other.setAttribute('aria-pressed', String(other === button)),
      )
    renderRatings()
  }),
)
document
  .querySelector('#rating-search')
  .addEventListener('input', renderRatings)
for (const id of ['copy-search', 'copy-format'])
  document.querySelector(`#${id}`).addEventListener('input', () => {
    const format = document.querySelector('#copy-format').value
    const search = normalize(document.querySelector('#copy-search').value)
    document.querySelectorAll('.physical-copy').forEach((copy) => {
      copy.hidden =
        (format && copy.dataset.format !== format) ||
        !normalize(copy.textContent).includes(search)
    })
  })
document.querySelectorAll('[data-next]').forEach((form) =>
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const title = form.querySelector('[name="title"]')?.value
    const artist = form.querySelector('[name="artist"]')?.value
    if (title && artist) selectAlbum({ ...selectedAlbum, title, artist })
    window.location.hash = form.dataset.next
    notice.textContent =
      'Vista de continuación del boceto. No se ha guardado nada en tu biblioteca.'
  }),
)
document
  .querySelectorAll('[data-dialog]')
  .forEach((button) =>
    button.addEventListener('click', () => showDialog(button.dataset.dialog)),
  )
document
  .querySelectorAll('.dialog-close')
  .forEach((button) => button.addEventListener('click', () => dialog.close()))
document
  .querySelectorAll('.physical-copy a')
  .forEach((link) =>
    link.addEventListener('click', () => selectAlbum(albums[0])),
  )
window.addEventListener('hashchange', renderScreen)
renderAlbums()
renderRatings()
renderScreen()
