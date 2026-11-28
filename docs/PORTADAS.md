# Portadas de la colección

Al añadir un álbum, Auditorium intenta encontrar su portada en Cover Art Archive y guardar una copia en este dispositivo. Puedes usar el disco mientras termina la búsqueda. Una portada ausente o un fallo de red nunca impide guardar el álbum.

En **Mi colección → Álbumes**, **Completar portadas** busca las que faltan en toda la colección activa, independientemente del filtro que estés viendo. También convierte los enlaces de Cover Art Archive guardados anteriormente en copias locales. No sustituye imágenes que añadiste a mano ni enlaces de otras fuentes.

La búsqueda se puede detener. Lo ya descargado permanece guardado; vuelve a pulsar Completar portadas para continuar con las pendientes. Los errores temporales se pueden reintentar y los discos sin imagen pueden completarse manualmente desde su ficha.

## Cómo se elige la imagen

- Con una referencia MusicBrainz guardada, se consulta la portada de esa obra. Un enlace de portada de una edición elegida conserva esa edición.
- Para un álbum manual se busca el artista y se compara título, créditos principales y año, cuando lo anotaste. Una coincidencia única se aplica sin cambiar nombres, notas ni vínculos del catálogo.
- Los artistas homónimos y las obras con varias coincidencias necesitan una elección. La revisión muestra año, clase de publicación y datos del artista. Puedes omitirla. No se crean identidades MusicBrainz a partir de una elección de portada.
- Si editas el álbum durante la descarga, se conserva tu edición y se descarta el resultado que ya no corresponde.

El origen es [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API), mantenido junto a MusicBrainz e Internet Archive. No todos los álbumes tienen una imagen disponible. La búsqueda necesita conexión y comunica los términos de artista y los identificadores consultados; no envía notas, valoraciones ni archivos de la biblioteca.

## Copias locales y respaldo

Las portadas descargadas se comprueban y se convierten a JPEG de hasta 500 píxeles en su lado mayor y 128 KiB por imagen. Se guardan en IndexedDB, separadas del documento musical. Su origen queda registrado; las URL Blob sólo existen durante la visualización.

Después de descargar una portada puedes verla sin red. Para reabrir toda la aplicación sin conexión, espera primero **Aplicación preparada para usar sin conexión** en Ajustes → Aplicación.

**Ajustes → Respaldos → Descargar respaldo completo (ZIP)** guarda datos, portadas descargadas y audio. Restaura ese archivo en una colección vacía para recuperar las imágenes en otro navegador. El JSON y la cuenta conservan el enlace de origen, pero las nuevas copias descargadas se trasladan en el ZIP. Las imágenes JPEG/PNG añadidas manualmente siguen incluidas en JSON como antes.

Se reservan hasta 128 MiB y 5.000 portadas por colección. El espacio real depende del navegador; un fallo de cuota conserva lo que ya estaba guardado. Los archivos de respaldo contienen datos personales y no están cifrados: guarda la copia fuera del repositorio público.

## Persistencia y compatibilidad

DB14/nativa140 añade `coverAttachments` y `coverFiles`, con clave `[scope+albumId]`. `scope` corresponde a la identidad local. Un índice por origen permite compartir la copia al mostrar varias apariciones; `albumArtists.albumId` evita releer el catálogo completo para guardar cada imagen. La migración conserva filas y checkpoints de DB13 y los valida antes de confirmar.

Guardar una portada escribe su origen, descriptor y bytes en una sola transacción, comprobando el estado esperado del álbum y sus créditos. Cambiar o quitar la portada, eliminar su obra del catálogo o cambiar de identidad elimina las copias que dejaron de corresponder. Retirar una entrada personal conserva su portada mientras la obra siga en el catálogo.

JSON9 y el snapshot remoto mantienen su contrato y límite de 20 MiB. Las imágenes descargadas no entran en RPC ni checkpoints. No hay cambios en el esquema remoto.

El respaldo completo conserva `audio-manifest.json` y `library.json`. Con portadas usa manifiesto **versión2**, agregando `covers`, rutas `covers/<albumId>.jpg`, origen, tamaño, dimensiones y SHA-256. Los bytes permanecen separados de library.json. La aplicación incluye el diseño en ZIP3; el servicio conserva la exportación ZIP1/2 cuando no se proporciona un diseño. Se leen las tres versiones. El paquete admite hasta 288 MiB, con presupuestos independientes de 128 MiB de audio y 128 MiB de portadas, 20 MiB de JSON y 4 MiB de índice. ZIP1 conserva sus límites históricos de 160 MiB e índice de 1 MiB.

Antes de restaurar se verifican rutas, archivos declarados, identidad, asociaciones, dimensiones y hashes. La escritura conjunta de identidad, biblioteca, audio y portadas es atómica; un fallo o cancelación revierte el destino. Una aplicación antigua no abre DB14 ni lee ZIP2. Conserva respaldos históricos separados y utiliza una versión actualizada para restaurar un ZIP2.

Los derechos de las imágenes pertenecen a sus titulares. Descargar una copia para tu colección no concede permiso para redistribuirla ni cambia las licencias del catálogo.

La aplicación incluye también [tu diseño personal](PERSONALIZACION.md) al descargar el respaldo completo: en ese caso escribe ZIP3, con el mismo contrato de portadas y lectura de ZIP1/2. El diseño se puede omitir al restaurar.
