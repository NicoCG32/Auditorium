# Dominio del catálogo

DOM-01 implementa los modelos y validadores del catálogo en `src/domain/catalog/`. No incluye almacenamiento, altas de interfaz ni la relación personal de biblioteca. El módulo no importa React ni Dexie y sus reglas no realizan llamadas remotas.

## Entidades y relaciones

| Entidad      | Identidad y función                                                              |
| ------------ | -------------------------------------------------------------------------------- |
| Artist       | UUID, nombre y metadatos opcionales                                              |
| Album        | UUID y obra conceptual; tipo predeterminado `album`                              |
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

Las comprobaciones de variantes son iterativas, sin depender de la profundidad de la pila de llamadas. La validación no crea entidades ni decide fusiones. Los casos de uso y las transacciones posteriores deberán aplicar estas reglas antes de guardar cambios.

## Convenciones

- UUID normalizados a minúsculas en entidades y referencias; no se generan IDs en este módulo.
- Nombres y textos recortan espacios exteriores conservando acentos y capitalización; texto requerido en blanco es inválido.
- Metadatos desconocidos se omiten. No se inventan año, duración, sello, país ni portada; `null` no representa un dato ausente en estos contratos.
- Año entero de 1 a 9999, sin consultar el reloj ni imponer un corte histórico arbitrario; las advertencias de plausibilidad con contexto pertenecen a una política posterior explícita.
- Duraciones y posiciones: enteros positivos seguros. Los números de disco y pista pueden tener huecos mientras se completa la lista.
- Portada opcional: URL HTTPS. No se descarga ni verifica la imagen al validar.
- Código de país opcional: dos letras mayúsculas; aquí se comprueba estructura, no pertenencia a un registro de países.
- `catalogScope` es `personal` en el MVP; compartir requiere una evolución explícita del contrato.
- Objetos estrictos: campos desconocidos son errores. Propiedad, ratings y escucha no se incorporan al catálogo.

Los fixtures son ficticios y se usan únicamente en pruebas. Los modelos todavía no se conectan a la bienvenida ni cargan datos por defecto.

Referencias: [ADR-002](adr/002-album-edicion-pista.md) y [validación con Zod](https://zod.dev/api).
