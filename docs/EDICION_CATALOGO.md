# Editar álbumes, géneros y países

La edición de metadatos y los formularios de UX-05 están integrados en main. La [clasificación del álbum](CLASIFICACION_ALBUM.md) documenta tipo, categorías y publicación independientes; la release v1.0.0 conserva sus archivos.

## Corregir un álbum guardado

Desde la ficha, «Editar álbum» abre los metadatos actuales: título, artistas acreditados, tipo principal, categorías, publicación, año original, géneros, país de origen de cada artista, portada y descripción. Cancelar descarta el borrador. Guardar valida y confirma una sola escritura local; no crea otra entrada de biblioteca ni cambia el ID del álbum.

Se mantienen listas, pistas, ediciones, escucha, notas personales, valoraciones, ejemplares, deseos y retirada. Cambiar el nombre de un artista crea un registro de artista para ese crédito del álbum; no renombra al artista usado por otros álbumes. Si se conserva su identidad y se corrige su país, el dato cambia también donde se acredita ese mismo artista. El editor informa de ese alcance antes de guardar. No hay fusión automática por nombre.

Título, nombre, alias o papel de los créditos forman parte de la identidad musical que ampara la referencia externa. Cambiarlos descarta `catalogReference` para evitar atribuir una coincidencia anterior al nuevo contenido. Corregir año, descripción, géneros, país o portada conserva la referencia. La edición no inicia consultas ni enriquecimiento automático en Wikidata.

```mermaid
sequenceDiagram
    actor Persona
    participant Editor as Editor de metadatos
    participant Caso as MusicLibrary.updateAlbum
    participant Repo as Repositorio local
    Persona->>Editor: Abrir y corregir metadatos
    Editor->>Editor: Conservar referencia de álbum, créditos y artistas leídos
    Persona->>Editor: Guardar
    Editor->>Caso: Borrador validado y estado esperado
    Caso->>Repo: mutate sobre snapshot vigente
    alt Los metadatos esperados cambiaron
        Repo-->>Editor: Conflicto sin escritura
        Editor-->>Persona: Conservar borrador y actualizar antes de reintentar
    else Coinciden los metadatos
        Repo->>Repo: Preservar IDs y relaciones, validar y confirmar
        Repo-->>Editor: Commit
        Editor->>Repo: Releer snapshot
        alt Lectura posterior fallida
            Editor-->>Persona: Guardado confirmado, reintentar sólo lectura
        else Lectura disponible
            Editor-->>Persona: Ficha actualizada
        end
    end
```

La comprobación compara álbum, créditos ordenados y artistas referenciados dentro de la transacción. Un cambio ajeno en una valoración no invalida por sí solo esos metadatos. Un conflicto no sobrescribe el estado vigente; una cuota insuficiente o aborto conserva los datos anteriores y el borrador. Si falla la lectura después de confirmar el commit, recuperar la vista no repite la escritura.

## Géneros y país de origen

`Album.genres` contiene hasta veinte etiquetas libres de hasta ochenta caracteres cada una. El alta y el editor permiten agregarlas o retirarlas; se omiten los valores vacíos y se rechazan duplicados normalizados. No se fuerza un vocabulario musical ni se deduce un género desde el título.

`Artist.country` es un texto opcional de hasta cien caracteres. Describe el origen del artista o banda; es independiente de `Release.countryCode`, que describe una edición. Se introduce manualmente, sin geolocalización ni catálogo obligatorio de países. Los álbumes con varios créditos pueden mostrar varios países conocidos; no se inventa el de los créditos incompletos.

La biblioteca permite buscar por género o país, combinarlos con escucha y nota, y ordenar por género o país A–Z. Las opciones se obtienen de toda la biblioteca activa para evitar filtros circulares. Se agrupan alias de mayúsculas, acentos y espacios, conservando una etiqueta legible. Los álbumes sin ese dato siguen visibles con «Todos» y se sitúan al final al ordenar por el campo ausente.

## Portada automática y archivo local

Elige una URL HTTPS o un archivo JPEG/PNG de hasta **2 MiB**. La vista previa aparece automáticamente al aportar el enlace o seleccionar un archivo válido; la ficha y las tarjetas muestran la portada guardada al abrirlas. No hay un paso adicional «Mostrar portada». Un error conserva la representación local y ofrece reintento.

La URL se solicita directamente al proveedor de la imagen, sin referrer de la aplicación; sólo se conserva el enlace. La búsqueda de catálogo puede proponer una portada representativa, pero el usuario decide si la incorpora. La existencia y los derechos de una imagen no se infieren por su URL. Las imágenes remotas requieren red y no se guardan mediante reglas del service worker.

El archivo local se comprueba por tamaño, MIME admitido, firma y decodificación de imagen antes de incorporarse al borrador. Se admiten hasta 8192 píxeles por eje y 32 millones de píxeles en total. SVG y otros formatos no se aceptan como portadas locales. Se guarda una data URL PNG/JPEG en `Album.coverImage`, sin rutas del equipo ni referencias temporales a Blob. Elegir URL o archivo es excluyente; cambiar de fuente permite reemplazar la portada anterior. El contrato del dominio y el importador de respaldos comprueban estructura, base64, tamaño y firma; la decodificación y las dimensiones se comprueban al seleccionar un archivo en la interfaz.

Una portada local confirmada pertenece a IndexedDB y al respaldo, por lo que puede mostrarse offline. Es distinta de la foto temporal de «Apariencia», que sólo vive en memoria. Los datos base64 ocupan más que el archivo original y cuentan dentro del límite de respaldo de **20 MiB**. Las imágenes de usuarios no se añaden a los recursos públicos del repositorio ni a la precaché.

## Compatibilidad, privacidad y validación

Al guardar, álbumes, nombres/alias de artistas y géneros adoptan mayúscula inicial por palabra, con las [excepciones de siglas del registro](REGISTRO_MANUAL.md#posibles-duplicados). Cambiar sólo mayúsculas o espacios mantiene la identidad del artista y la referencia externa del álbum. Una corrección real de nombre conserva las reglas de creación de identidad de este documento. Los textos históricos no se reescriben al leer o importar respaldos; se uniforman al editarlos.

El incremento vigente utiliza DB8/nativa80 y respaldo5. Valida los contratos históricos antes de migrar su clasificación y preserva identidad, metadatos y relaciones; los documentos del checkpoint se convierten en la misma transacción. Véase [clasificación y compatibilidad](CLASIFICACION_ALBUM.md#migración-y-compatibilidad). Una aplicación anterior no puede abrir la base ni leer el archivo nuevos.

El contexto de recomendaciones mantiene la lista permitida anterior. No se envían géneros, países, URL de portada ni imágenes locales al modelo. La edición no genera solicitudes de IA. Consulta [respaldos](RESPALDOS_JSON.md), [integraciones](INTEGRACIONES_OPCIONALES.md) y [ADR-009](adr/009-edicion-metadatos-portadas.md).

La aceptación debe comprobar alta y edición, cancelación, conflictos, conservación de relaciones y recarga; combinación de filtros y orden sin datos; archivos válidos e inválidos, cambio de portada y fallos de red; respaldo5 y versiones previas; reapertura offline de imágenes locales; teclado, foco, errores y pantallas pequeñas. La issue de cada incremento registra su evidencia de validación.
