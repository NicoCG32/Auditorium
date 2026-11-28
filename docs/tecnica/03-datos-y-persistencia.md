# Datos y persistencia

**Fuente de verdad:** `src/infrastructure/db/database.ts` declara los stores e índices; `src/domain/backup.ts` declara el snapshot; `src/domain/audio.ts` y las migraciones SQL delimitan audio y remoto.

## Una base de datos en el navegador

La base local se llama `auditorium`, se gestiona con Dexie e IndexedDB y tiene **versión Dexie 14** (`SCHEMA_V14`). El navegador utiliza el origen web y su perfil como frontera de almacenamiento: es distinto de una base PostgreSQL remota.

### Diagrama físico simplificado de IndexedDB

```mermaid
flowchart TB
  subgraph DB["IndexedDB · auditorium · DB14"]
    ID["metadata · identidad local"]
    subgraph CAT["Catálogo"]
      A[artists]
      B[albums]
      AA[albumArtists]
      T[tracks]
      CT[coreTracks]
      R[releases]
      RT[releaseTracks]
    end
    subgraph PERSONAL["Biblioteca y colección"]
      UA[userAlbums]
      AR[albumRatings]
      AGR[albumGenreRatings]
      TR[trackRatings]
      O[ownedItems]
      W[purchaseWishes]
    end
    subgraph TRANS["Estado local y audio"]
      S[syncCheckpoint]
      AT[audioAttachments]
      AF[audioFiles]
      CA[coverAttachments]
      CF[coverFiles]
    end
  end
  ID -.-> UA
  B -.-> UA
  UA -.-> AR & AGR & TR & O & W & AT
  AT -.-> AF
  B -.-> CA
  CA -.-> CF
  S -.-> UA
  classDef primary fill:#263244,color:#fff,stroke:#8d343a;
  class ID,B,UA,AT,AF primary;
```

Las flechas punteadas expresan **dependencias lógicas**, no claves foráneas administradas por IndexedDB. El esquema completo se lee en el archivo de código, donde están los índices y las restricciones de unicidad.

### Claves e índices que importan

| Store                            | Clave / índice relevante                            | Finalidad                              |
| -------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `artists`                        | `id`, búsqueda por `name`                           | Reutilizar identidades de artistas     |
| `albums`                         | `id`, índices por título, tipo y año                | Identidad de obra y exploración        |
| `albumArtists`                   | `[albumId+artistId+role]`, posición única por álbum | Créditos múltiples ordenados           |
| `tracks`                         | `id`, `albumId`                                     | Pistas independientes de apariciones   |
| `coreTracks`                     | `[albumId+discNumber+trackNumber]`                  | Lista principal del álbum              |
| `releases`                       | `id`, `albumId`, `format`                           | Ediciones del álbum                    |
| `releaseTracks`                  | `id`, posición única por edición                    | Lista concreta de edición              |
| `userAlbums`                     | `id`, `activeAlbumKey` único                        | Entrada personal activa/retirada       |
| `albumRatings`                   | `userAlbumId`                                       | Una nota general por entrada           |
| `albumGenreRatings`              | `[userAlbumId+genreKey]`                            | Una nota por género y entrada          |
| `trackRatings`                   | `[userAlbumId+trackId]`                             | Una nota por pista y entrada           |
| `ownedItems`, `purchaseWishes`   | `id`, `userAlbumId`                                 | Ejemplares y deseos                    |
| `metadata`, `syncCheckpoint`     | `key`                                               | Identidad y checkpoint remoto          |
| `audioAttachments`, `audioFiles` | `[scope+id]`                                        | Descriptor y bytes por identidad local |

## Tres formatos con finalidades diferentes

DB13 conserva los índices únicos `musicBrainz.id` en artistas y álbumes de DB12 y añade uno en ediciones y otro compuesto `[albumId+musicBrainz.id]` en pistas. Una grabación puede aparecer en álbumes locales distintos. El snapshot JSON9 conserva identificador de origen y fecha de consulta; estos vínculos no sustituyen UUID locales. [Importación y compatibilidad](../DISCOGRAFIAS.md).

| Contrato             | Versión en código   | Incluye                                              | Excluye                                           |
| -------------------- | ------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Base local IndexedDB | DB14                | Metadatos, biblioteca, checkpoints, audio y portadas | No es un archivo transportable por sí sola        |
| Respaldo/snapshot    | `schemaVersion = 9` | Identidad, catálogo y biblioteca                     | Audio y copias descargadas de portadas; caché PWA |
| Respaldo completo    | ZIP3                | Snapshot y archivos con manifiesto e integridad      | No crea una cuenta remota                         |

DB14 añade `coverAttachments` y `coverFiles` por `[scope+albumId]`, separados del snapshot. El origen tiene índice `[scope+sourceUrl]` y los créditos se consultan por `albumId`. [Portadas y respaldo completo](../PORTADAS.md).

Cada contrato tiene su propia versión: IndexedDB (`14`), snapshot (`9`), diseño (`1`), ZIP (`3` con diseño, `2` con portadas, `1` sin ellas) y aplicación (`1.1.0`). Los validadores mantienen lectores de versiones anteriores y migraciones específicas.

## PostgreSQL opcional en Supabase

```mermaid
 erDiagram
    AUTH_USER ||--o| LIBRARY_SNAPSHOT : propietario
    AUTH_USER {
      uuid id PK
    }
    LIBRARY_SNAPSHOT {
      uuid owner_id PK
      bigint revision
      integer schema_version
      jsonb snapshot
      uuid last_operation_id
      timestamptz updated_at
    }
```

El dato remoto está modelado como **un documento JSONB por cuenta**, en `public.library_snapshots`, no como los 19 almacenes locales replicados en SQL. La tabla utiliza `owner_id`, RLS y funciones RPC con control de revisión para evitar sobrescrituras concurrentes. El código admite versiones históricas y crea el formato vigente `schema_version = 9` al guardar. **No almacena audio propio ni copias de portadas descargadas**.

La base local conserva las transacciones de la experiencia en este dispositivo. Un checkpoint permite razonar sobre qué snapshot fue confirmado remotamente; las operaciones de red no se ejecutan dentro de una transacción IndexedDB abierta.

## Límites y riesgos

- Snapshot JSON: **20 MiB máximo** (`MAX_BACKUP_BYTES`); la base remota también valida tamaño del documento.
- Audio: **16 MiB por archivo**, **128 adjuntos**, **128 MiB por biblioteca**. Portadas descargadas: **128 KiB por imagen**, **5.000 imágenes** y **128 MiB por colección**. ZIP3 completo: **288 MiB máximo**, índice de hasta 4 MiB; ZIP1 mantiene 160 MiB e índice de 1 MiB.
- Un respaldo antiguo debe pasar por el lector y migración compatibles; **no** se deben editar IDs a mano para forzar una restauración.
- Los nombres de entidades en un diagrama no son garantía de cifrado local: IndexedDB depende de la seguridad del perfil del navegador y el dispositivo.

[Reglas de dominio](02-dominio.md) · [Restauración y flujos](04-flujos-y-estados.md) · [Cuenta y seguridad](05-integraciones-y-seguridad.md)

El diseño personal se almacena fuera de IndexedDB y del snapshot musical, en `auditorium.personal-design.v1`. Se incluye en ZIP3 como `design.json` con SHA-256; la restauración permite conservar el diseño del destino. [Contrato y límites](../PERSONALIZACION.md).
