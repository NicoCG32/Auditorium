# Flujos y máquinas de estado

Los diagramas de arquitectura responden _dónde vive cada responsabilidad_. Estos responden _qué ocurre al usarla_ y _cuándo se modifica la información_. Las transiciones se basan en `src/domain/library/schemas.ts`, `src/domain/library/library.ts`, `src/application/library-sync.ts` y los casos de uso de `src/application/`.

## Flujo 1 — Alta y uso de un álbum

```mermaid
flowchart TD
    OPEN([Abrir Auditorium]) --> SEARCH["Buscar en la biblioteca"]
    SEARCH --> EXISTS{"¿Ya está registrado?"}
    EXISTS -->|Sí| ALBUM["Abrir ficha existente"]
    EXISTS -->|No| FORM["Registrar álbum y créditos"]
    FORM --> CHECK["Validar identidad, pistas, edición y relaciones"]
    CHECK --> VALID{"¿Datos válidos?"}
    VALID -->|No| CORRECT["Corregir formulario sin descartar borrador"] --> FORM
    VALID -->|Sí| COMMIT["Guardar en IndexedDB mediante caso de uso"] --> ALBUM
    ALBUM --> ACTION{"¿Qué quiero hacer?"}
    ACTION -->|Experiencia| LISTEN["Escucha, notas y valoraciones"]
    ACTION -->|Colección| OWN["Ejemplar o deseo de compra"]
    ACTION -->|Consulta| PLAY["Enlace, reproductor o audio local"]
    LISTEN --> CONFIRM["Validar y guardar cambio"]
    OWN --> CONFIRM
    CONFIRM --> ALBUM
    PLAY --> ALBUM
    ALBUM --> BACKUP["Exportar respaldo si corresponde"]
    BACKUP --> END([Biblioteca conservada])
    classDef main fill:#263244,color:#fff,stroke:#8d343a;
    class FORM,COMMIT,ALBUM,CONFIRM main;
```

La ficha no tiene una sola salida: escuchar, valorar y coleccionar son acciones independientes. Una búsqueda de metadatos externos es una ayuda revisable, no una operación que salte la validación del catálogo.

## Flujo 2 — Cambio de datos personales

```mermaid
sequenceDiagram
    autonumber
    actor Persona
    participant UI as Interfaz
    participant UC as Caso de uso
    participant DOM as Validadores de dominio
    participant DB as IndexedDB
    Persona->>UI: Edita escucha, nota o ejemplar
    UI->>UC: Envía valores y referencia anterior
    UC->>DB: Lee versión/estado actual
    DB-->>UC: Estado vigente
    UC->>DOM: Valida identidad, pertenencia y reglas
    alt Cambio compatible
      DOM-->>UC: Aceptado
      UC->>DB: Transacción de actualización
      DB-->>UC: Confirmación
      UC-->>UI: Datos actualizados
    else Cambio inválido u obsoleto
      DOM-->>UC: Rechazo / conflicto
      UC-->>UI: Explica causa y mantiene revisión
    end
    UI-->>Persona: Muestra estado final
```

La comprobación de la referencia anterior depende del caso de uso; no toda edición tiene exactamente el mismo token. El principio común es **no ocultar una edición concurrente ni borrar otra relación para completar la operación actual**.

## Estados: experiencia de escucha

La propiedad `listeningStatus` acepta `untracked`, `queued`, `in_progress` y `completed`. El dominio no impone un itinerario obligatorio entre ellas: puede cambiarse directamente de cualquiera a otra. Este diagrama muestra un recorrido habitual y la posibilidad de cambiarlo, **no un flujo excluyente**.

```mermaid
stateDiagram-v2
    [*] --> Untracked
    state "Sin seguimiento" as Untracked
    state "Pendiente" as Queued
    state "En curso" as InProgress
    state "Completado" as Completed
    Untracked --> Queued: anotar pendiente
    Queued --> InProgress: comenzar
    InProgress --> Completed: completar
    Completed --> InProgress: retomar
    Completed --> Queued: volver a pendiente
    InProgress --> Untracked: limpiar estado
    note right of InProgress
      También se admiten cambios
      directos entre los otros estados.
    end note
```

## Estados: deseos de adquisición

```mermaid
stateDiagram-v2
    [*] --> Active: deseo nuevo
    state "Activo" as Active
    state "Cumplido" as Fulfilled
    state "Cancelado" as Cancelled
    Active --> Fulfilled: ejemplar compatible confirmado
    Active --> Cancelled: cancelar
    Cancelled --> Active: reactivar
    Fulfilled --> Active: reactivar
```

Crear un deseo exige objetivo (edición o formato) y estado activo. **Cumplirlo requiere una adquisición compatible y que el deseo esté activo.** Las transiciones posteriores a cancelado/cumplido se expresan como reactivaciones; el estado de una compra no se crea automáticamente con una nota de escucha.

## Estados: entrada personal activa o retirada

```mermaid
stateDiagram-v2
    [*] --> Active: registrar álbum
    state "Activa" as Active
    state "Retirada" as Removed
    Active --> Removed: confirmar retirada
    Removed --> Active: restaurar si no existe otra activa del mismo álbum
```

Retirar es una marca (`deletedAt`), no eliminar el catálogo y todas las relaciones. Restaurar respeta las reglas de identidad y conflictos.

## Flujo 3 — Respaldo, cambio de dispositivo y audio

```mermaid
flowchart TD
    CURRENT["Biblioteca local"] --> WANT{"¿Necesito trasladar audio propio?"}
    WANT -->|No| JSON["Exportar JSON/snapshot 7"]
    WANT -->|Sí| ZIP["Exportar ZIP1 completo con manifiesto y SHA-256"]
    JSON --> COPY["Conservar archivo fuera del navegador"]
    ZIP --> COPY
    COPY --> TARGET["Abrir Auditorium en destino"]
    TARGET --> REVIEW["Revisar tipo de respaldo, versión y estado del destino"]
    REVIEW --> COMP{"¿Compatible y validado?"}
    COMP -->|No| STOP["No sobrescribir; conservar ambos conjuntos"]
    COMP -->|Sí| RESTORE["Confirmar y restaurar con garantías del caso de uso"]
    RESTORE --> VERIFY["Reabrir y revisar álbumes, notas y audio si aplica"]
    classDef main fill:#263244,color:#fff,stroke:#8d343a;
    class JSON,ZIP,RESTORE main;
```

El archivo JSON nunca reemplaza el ZIP completo para transportar los bytes de audio. La restauración de un respaldo completo y la **importación aditiva** son procesos distintos: el segundo aparece como cambio _sin publicar_ en `CHANGELOG` y exige revisión de conflictos.

## Flujo 4 — Sincronización opcional

```mermaid
sequenceDiagram
    autonumber
    actor Persona
    participant Local as Repositorio local
    participant Sync as LibrarySync
    participant Remote as Supabase
    Persona->>Sync: Sincronizar (cuenta configurada)
    Sync->>Local: Leer snapshot y checkpoint
    Local-->>Sync: Base, revisión, cambios pendientes
    Sync->>Remote: Consultar/guardar por revisión esperada
    alt Revisión coincide
      Remote-->>Sync: Snapshot confirmado + nueva revisión
      Sync->>Local: Validar y aplicar checkpoint actualizado
      Local-->>Sync: Confirmación
      Sync-->>Persona: Sincronización completada
    else Revisión o cambios incompatibles
      Remote-->>Sync: Conflicto / snapshot remoto
      Sync-->>Persona: Conservar estados y pedir resolución
    else Sin conexión o fallo
      Remote--xSync: Error de red/servicio
      Sync-->>Persona: Cambios siguen locales, reintentar
    end
```

`LibrarySync` usa snapshots y checkpoints. El algoritmo intenta una fusión de registros cuando sus cambios no son incompatibles; **no** resuelve automáticamente dos ediciones divergentes del mismo registro. El audio sigue fuera del remoto.

```mermaid
stateDiagram-v2
    [*] --> Idle
    state "idle" as Idle
    state "syncing" as Syncing
    state "synced" as Synced
    state "error" as Error
    state "conflict" as Conflict
    Idle --> Syncing: petición explícita o reintento
    Syncing --> Synced: confirmado
    Syncing --> Error: fallo
    Syncing --> Conflict: discrepancia no fusionable
    Error --> Syncing: reintentar
    Conflict --> Syncing: tras resolver
    Synced --> Idle: cambios locales
    Synced --> Syncing: sincronizar de nuevo
```

[Arquitectura](01-arquitectura.md) · [Persistencia](03-datos-y-persistencia.md) · [Integraciones](05-integraciones-y-seguridad.md)
