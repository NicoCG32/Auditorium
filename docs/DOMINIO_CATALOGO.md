# Dominio del catálogo

UX-05 incorpora la [clasificación independiente y sus migraciones](CLASIFICACION_ALBUM.md): DB8/nativa80 y respaldo5. Album describe la obra; Release conserva las ediciones; UserAlbum, la experiencia y los enlaces personales.

DOM-01 implementa los modelos y validadores del catálogo en `src/domain/catalog/`. No incluye almacenamiento, altas de interfaz ni la relación personal de biblioteca. El módulo no importa React ni Dexie y sus reglas no realizan llamadas remotas.

## Entidades y relaciones

| Entidad      | Identidad y función                                                              |
| ------------ | -------------------------------------------------------------------------------- |
| Artist       | UUID, nombre y metadatos opcionales                                              |
| Album        | UUID y obra conceptual; tipo principal, categorías y publicación independientes  |
| AlbumArtist  | Crédito de artista, rol y posición en un álbum                                   |
| Track        | UUID y pista dentro de un álbum; variante opcional de otra pista del mismo álbum |
| CoreTrack    | Aparición y posición en la lista original de referencia                          |
| Release      | UUID de edición, álbum y formato; metadatos opcionales                           |
| ReleaseTrack | UUID de aparición, edición, pista, disco, posición y rol de contenido            |

Un catálogo válido tiene al menos un artista principal existente por álbum, pero admite varios artistas principales y colaboradores. Los nombres coincidentes no se fusionan. Un remaster puede reutilizar los mismos identificadores de pistas; los títulos no determinan automáticamente si dos versiones son iguales.

Cada lista de edición conserva su propio orden. Una pista puede repetirse dentro de una edición en posiciones diferentes. La lista original es independiente de esas apariciones. El carácter bonus o alternativo pertenece a la aparición en una edición, no a la pista globalmente.

## Validación

Los schemas de `schemas.ts` comprueban una entidad o una estructura: campos, formatos y enumeraciones. Sus tipos TypeScript se derivan de esos schemas para evitar dos definiciones diferentes del mismo modelo.

`catalogSchema` en `catalog.ts` valida además las relaciones de un conjunto completo de artistas, álbumes, créditos, pistas, listas originales y ediciones. Exige las siete listas, aunque estén vacías; no sustituye listas faltantes silenciosamente. Usa `parse` para obtener datos normalizados o `safeParse` para recibir un resultado de éxito/error.

`getCatalogIssues` en `integrity.ts` recibe un catálogo ya validado estructuralmente y devuelve errores relacionales sin modificarlo. Los errores incluyen regla, ruta del dato y mensaje. El schema completo los expone como issues Zod con `params.rule`.

| Regla                  | Condición                                                                    |
| ---------------------- | ---------------------------------------------------------------------------- |
| duplicate_id           | UUID repetido dentro de una tabla                                            |
| missing_reference      | Artista, álbum, edición o pista referenciados no existen                     |
| missing_primary_artist | Falta un crédito principal con artista existente                             |
| duplicate_credit       | Mismo álbum, artista y rol repetidos                                         |
| duplicate_position     | Posición de crédito ocupada en un álbum, o disco/pista ocupados en una lista |
| wrong_album            | Lista o variante apunta a una pista de otro álbum                            |
| cyclic_variant         | Autociclo o ciclo indirecto entre variantes                                  |

Las comprobaciones de variantes son iterativas, sin depender de la profundidad de la pila de llamadas. La validación no crea entidades ni decide fusiones. Los casos de uso y el repositorio transaccional aplican estas reglas antes de guardar cambios.

## Convenciones

- UUID normalizados a minúsculas en entidades y referencias; no se generan IDs en este módulo.
- Nombres y textos recortan espacios exteriores conservando acentos y capitalización; texto requerido en blanco es inválido.
- Metadatos desconocidos se omiten. No se inventan año, duración, sello, país ni portada; `null` no representa un dato ausente en estos contratos.
- Año entero de 1 a 9999, sin consultar el reloj ni imponer un corte histórico arbitrario; las advertencias de plausibilidad con contexto pertenecen a una política posterior explícita.
- Duraciones y posiciones: enteros positivos seguros. Los números de disco y pista pueden tener huecos mientras se completa la lista.
- Portada opcional: URL HTTPS o data URL JPEG/PNG local de hasta 2 MiB, mutuamente excluyentes. El dominio comprueba estructura, base64 y firma de la imagen local; no hace red ni decodifica imágenes. La selección de archivos comprueba también decodificación y dimensiones en el navegador.
- Géneros de álbum opcionales: hasta veinte etiquetas libres de ochenta caracteres, sin duplicados normalizados.
- País de artista opcional: texto de hasta cien caracteres. `Release.countryCode`, propio de una edición, admite dos letras mayúsculas; aquí se comprueba su estructura, no pertenencia a un registro de países.
- `catalogScope` es `personal` en el MVP; compartir requiere una evolución explícita del contrato.
- Objetos estrictos: campos desconocidos son errores. Propiedad, ratings y escucha no se incorporan al catálogo.

Los fixtures son ficticios y se usan únicamente en pruebas. La ficha consulta el catálogo guardado y permite editar [listas originales y ediciones](LISTAS_EDICIONES.md). No se cargan datos de ejemplo por defecto.

## Referencia de catálogo opcional

CAT-01 amplía `Album` con `catalogReference`: proveedor Wikidata, QID, fecha UTC y referencias opcionales de grupo MusicBrainz, álbumes Spotify y videos YouTube. Es un valor estricto anidado, sin tabla ni índice nuevo. Conserva el UUID local y no autoriza fusión por nombre o ID externo. El [modelo de dominio](MODELO_DOMINIO.md#referencia-externa-de-álbum) detalla formatos y límites.

La búsqueda remota prepara candidatos y el usuario confirma un borrador editable antes del alta. La validación del dominio no hace llamadas ni afirma existencia remota; tampoco requiere que Wikidata conozca el álbum. El registro manual continúa siendo válido. El incremento posterior UX-01 añade géneros del álbum, país de artista y portada local, y permite editar metadatos conservando la identidad del álbum. Usa DB5 y respaldo3, con compatibilidad de entrada para respaldos1/2 estrictos; véase [edición del catálogo](EDICION_CATALOGO.md). Las claves y resultados de recomendaciones no forman parte del catálogo. Véanse [integraciones opcionales](INTEGRACIONES_OPCIONALES.md) y [ADR-008](adr/008-integraciones-opcionales.md).

Referencias: [ADR-002](adr/002-album-edicion-pista.md) y [validación con Zod](https://zod.dev/api).
