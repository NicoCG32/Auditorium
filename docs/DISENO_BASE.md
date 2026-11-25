# Diseño base

La identidad de Auditorium usa el vinilo como emblema de una colección personal. El tema **oscuro**, predeterminado, combina fondos neutros con carmesí; el tema **claro** utiliza superficies claras y el mismo acento. Las portadas y la navegación tienen prioridad visual. La ambientación ilustrada es opcional.

## Tokens y tipografía

[`src/styles/base.css`](../src/styles/base.css) declara las variables semánticas y [`src/styles/app-shell.css`](../src/styles/app-shell.css) aplica la paleta de la navegación actual. Tailwind las expone mediante `@theme inline`; los componentes conservan utilidades como `bg-background`, `text-foreground` y `text-muted`. El atributo `data-aud-theme` selecciona la paleta.

| Token          | Oscuro  | Claro   | Uso                       |
| -------------- | ------- | ------- | ------------------------- |
| background     | #111315 | #F1F2F4 | Fondo principal           |
| surface        | #191C20 | #FFFFFF | Superficies de contenido  |
| surface-raised | #24282E | #E7E9EE | Paneles secundarios       |
| foreground     | #F0F1F3 | #20242C | Texto principal           |
| muted          | #B0B5C0 | #535D6C | Texto secundario          |
| accent         | #A52C40 | #752337 | Fondos y detalles carmesí |
| accent-hover   | #BB4054 | #922D44 | Estado de interacción     |
| accent-text    | #ED8495 | #752337 | Texto destacado           |
| on-accent      | #FFF5EF | #FFF8F2 | Texto sobre acento        |
| focus          | #EFB56B | #6D3450 | Foco de teclado           |
| border         | #3B414A | #BBC2CC | Separadores               |

La interfaz utiliza `system-ui`, con alternativas del sistema; los títulos de identidad utilizan Georgia o Times New Roman. No se descargan fuentes ni se requieren servicios externos. El carmesí de fondo y el texto destacado tienen tokens separados: comprobar el contraste de cada combinación real al añadir componentes, incluidos sus estados de foco y selección.

## Marca y ambientación

Los recursos de producción están en [`public/auditorium/`](../public/auditorium/). Los SVG son composiciones vectoriales simplificadas; los WebP conservan las ilustraciones detalladas y su transparencia. No son representaciones intercambiables a cualquier tamaño.

| Contexto        | Recurso                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Barra lateral   | `brand/wordmark-dark.svg` o `brand/wordmark-light.svg`, según el tema elegido                         |
| Fondo oscuro    | `backgrounds/sanctuary-desktop.webp` y `sanctuary-mobile.webp`                                        |
| Fondo claro     | `backgrounds/parchment-desktop-light.svg` y `parchment-mobile-light.svg`                              |
| Navegador y PWA | `icons/favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` |

La marca cambia con el selector de la aplicación, sin depender del esquema del sistema. Los fondos tienen variantes de escritorio y móvil; una capa de protección y superficies opacas separan la decoración del contenido operativo. Los recursos ornamentales no interceptan pulsaciones ni aportan nombres accesibles redundantes. Las portadas guardadas siguen perteneciendo al catálogo: el emblema no sustituye una portada existente.

## Preferencias y foto temporal

**Ajustes → Personalización** permite dar nombre a la colección, elegir portadas o lista, ajustar el tamaño y mostrar detalles en las tarjetas. El panel se cierra con **Cerrar ajustes** o Escape, sin abandonar la música ni los formularios abiertos. El nombre, vista, tamaño, detalles y orden se guardan bajo `auditorium.collection-view.v1`. La primera apertura muestra portadas medianas, información breve y orden por artista. Las preferencias son independientes del snapshot musical y no forman parte de JSON, ZIP ni sincronización.

El mismo panel permite elegir **Oscuro/Claro**, activar **«Fondo decorativo»** y seleccionar una **«Foto de fondo (opcional)»**. El tema inicial es oscuro, con fondo decorativo desactivado para preferencias nuevas; las elecciones válidas ya guardadas se conservan. Tema y activación utilizan `auditorium.appearance.v1`; si el navegador impide guardar preferencias, los controles siguen funcionando durante esa apertura.

La foto es una vista previa local, elegida explícitamente desde un archivo PNG, JPEG o WebP de **hasta 5 MiB**. La selección comprueba formato y decodificación. Permite ajustar opacidad entre 5 % y 25 %, posición izquierda/centro/derecha y **«Quitar foto»**. No se sube a ningún servicio, no se guarda en IndexedDB ni en `localStorage` y no se incluye en respaldos. Al recargar o cerrar la aplicación se descarta. Las referencias temporales `blob:` se revocan al reemplazar, quitar o desmontar la vista, y al descartar una carga fallida o cancelada.

Desactivar la ambientación oculta los fondos y la foto; no elimina la selección temporal. La aplicación conserva superficies y controles legibles sin imágenes. No se distribuyen fotografías de artistas ni se solicitan imágenes decorativas a servicios externos.

## Recursos sin conexión y rutas

La distribución contiene **21 recursos visuales**. La precaché PWA conserva **13**: dos wordmarks, logo apilado, cuatro fondos, divisor simple, favicon y cuatro PNG de instalación. Ocupan aproximadamente **1131 KiB** y se preparan para uso sin red en ambos temas, **también cuando la ambientación está desactivada**. El logo apilado y el divisor permanecen disponibles aunque la navegación actual ya no los representa en el vacío ni al pie. Desactivar fondos reduce su representación, no la descarga de la precaché.

Los ocho recursos restantes —logo horizontal, monograma detallado, emblema detallado, divisor ornamentado, altar, dos isotipos SVG y textura de surcos— se distribuyen como recursos disponibles, pero la interfaz actual no los usa ni los precarga. No se incluyen PNG de edición de gran tamaño ni imágenes conceptuales.

Los componentes construyen sus URLs públicas mediante `import.meta.env.BASE_URL`. En el CSS fuente, Vite reconoce `url('/auditorium/...')` como recurso público y añade la base del build. Así se conservan las mismas rutas bajo `/` y `/Auditorium/` sin duplicar imágenes con hash. El manifest y los enlaces HTML utilizan las rutas correspondientes a cada compilación. Véanse [PWA](PWA_OFFLINE.md) y [publicación web](PUBLICACION_WEB.md).

## Interacción y adaptación

- Navegación lateral en escritorio e inferior en móvil: Buscar, Mi colección, Deseos, Sugerencias y Ajustes. Álbumes, Artistas, Ejemplares y Calificaciones comparten las vistas de colección.
- Ajustes reúne personalización, cuenta, respaldos, retirados y aplicación. Los avisos importantes de conexión y actualización permanecen visibles junto al contenido.
- Colección con tamaño de portadas ajustable, cuadrícula adaptable y vista de lista, sin anchos fijos de contenido.
- Enlace «Ir al contenido» visible al recibir foco; destino principal identificable.
- Foco visible de tres píxeles y controles de apariencia con áreas de interacción de al menos 44 píxeles de alto.
- Sin animaciones continuas; las transiciones se desactivan con `prefers-reduced-motion`. En colores forzados se oculta la ambientación y se conservan bordes funcionales.
- Decoración de vinilo en CSS, marcada como decorativa para lectores de pantalla. Las tarjetas y la ficha muestran automáticamente la portada guardada por URL o archivo local. El registro y la edición muestran una vista previa automática; el vinilo se conserva como alternativa cuando no hay imagen o falla. No se distribuyen carátulas de usuarios como recursos propios.
- Controles de búsqueda, escucha, nota, orden y vista operativos sobre la biblioteca guardada. Registro manual con validación, revisión de duplicados y ficha con metadatos y valoración. Errores de escritura y lectura con reintento y foco accesible.
- Editor separado de experiencia personal, con estado de escucha y comentario multilínea. Una operación de detalle bloquea los otros editores hasta guardar y actualizar la ficha; los conflictos conservan el borrador para su revisión.
- Estados separados de carga, vacío, sin coincidencias y error con reintento. Ver [consulta de biblioteca](CONSULTA_BIBLIOTECA.md).

La revisión de cada cambio visual debe cubrir ambos temas, móvil de 360 píxeles, teclado, movimiento reducido, fondos desactivados y funcionamiento sin red. Estos criterios no sustituyen la comprobación de contraste ni una revisión en dispositivos reales.

## Validación de VIS-01

La adaptación de 2026-10-16 se verificó con 564 pruebas en 33 archivos y 37 recorridos E2E locales en Chromium, Pages y WebKit. Los cinco recorridos nuevos cubren ambos temas a 360 y 1280 píxeles, estados vacío/formulario/biblioteca/lista/ficha, cambio de tema con borrador abierto, persistencia de preferencias y foto temporal. Se comparan las 13 tablas antes y después para comprobar que la apariencia no modifica los registros musicales. Los recorridos existentes conservan las comprobaciones de teclado, 320 píxeles, texto al 200 %, respaldos, migraciones y actualización entre ventanas.

En aquella adaptación, las auditorías automatizadas de los estados recorridos no detectaron infracciones A/AA. La paleta de octubre alcanzó un contraste mínimo de 6,65:1 para texto principal, secundario y destacado, y de 4,92:1 en botones carmesí, incluido hover. El foco superó 7:1 frente a sus superficies. Son resultados históricos de esas combinaciones y recorridos; no describen una certificación de accesibilidad ni sustituyen la revisión de la paleta actual.

La revisión visual cubrió escritorio y móvil, ambos temas y ficha sin conexión. La precaché contiene los 13 recursos visuales previstos en raíz y Pages; permite cambiar de tema sin red. Quedan pendientes la comprobación en dispositivos móviles físicos y con lectores de pantalla, y la persistencia de fotos personales como una función futura independiente.

Referencias: [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite), [variables de tema](https://tailwindcss.com/docs/theme) y [contraste de texto](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).
