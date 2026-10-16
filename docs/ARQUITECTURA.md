# Arquitectura del sistema

Referencia: **Auditorium v1.0.0**, MVP local publicado. Este documento describe la implementación ejecutable y sus límites; las decisiones históricas se conservan en los [ADR](README.md#decisiones-de-arquitectura). Los modelos de [dominio](MODELO_DOMINIO.md) y [datos](MODELO_DATOS.md) completan esta vista.

## 1. Objetivo y alcance

Auditorium permite registrar, consultar y valorar una biblioteca musical y organizar ediciones, ejemplares y deseos de compra. La versión 1.0.0 es una aplicación web de una sola página, instalable como PWA donde el navegador lo admita. Ejecuta sus casos de uso y conserva la biblioteca en el dispositivo, por origen y perfil del navegador.

La estructura distingue datos musicales de catálogo, experiencia personal y recursos de la aplicación. No dispone de servidor de biblioteca ni de una cuenta autenticada. Las plataformas musicales son referencias externas que la persona puede consultar; esta versión no importa, sincroniza ni reproduce sus catálogos.

## 2. Contexto del sistema

```mermaid
flowchart LR
    Persona["Persona que organiza su música"]
    App["Auditorium<br/>Biblioteca musical local"]
    Hosting["Servidor estático<br/>HTTPS o localhost"]
    Archivos["Archivos de respaldo JSON<br/>Fuera del navegador"]
    Externo["Sitios y portadas externos<br/>Requieren conexión"]
    Persona -->|Registro y consulta| App
    Hosting -->|Código, manifest y recursos visuales| App
    App -->|Exportación explícita| Archivos
    Archivos -->|Selección y restauración confirmada| App
    Persona -->|Consulta externa| Externo
    App -.->|Mostrar portada por acción explícita| Externo
```

El servidor distribuye archivos de la aplicación; no recibe las notas, valoraciones o respaldos. Mostrar una portada externa solicita su URL al proveedor. La disponibilidad de red que informa el navegador es una señal local, no una comprobación de disponibilidad de esos sitios.

## 3. Componentes en ejecución

```mermaid
flowchart TB
    Hosting["Servidor estático"]
    subgraph Navegador["Navegador"]
        SPA["SPA React + TypeScript"]
        Casos["Casos de uso locales"]
        Adaptador["IndexedDbRepository + Dexie"]
        DB[("IndexedDB: auditorium<br/>Identidad, catálogo y biblioteca")]
        Offline["OfflineController<br/>Instalación y almacenamiento"]
        SW["Service worker generado<br/>Workbox"]
        Cache[("Cache Storage<br/>Recursos propios de la aplicación")]
        SPA --> Casos
        Casos --> Adaptador
        Adaptador --> DB
        SPA -->|Acciones| Offline
        Offline -->|Registro y estado| SW
        SW --> Cache
        SW -->|Recursos offline| SPA
    end
    Hosting -->|Primera apertura o actualización| SPA
    Hosting -->|Precarga| SW
    Archivo["Respaldo JSON seleccionado o descargado"]
    SPA <-->|Importar o exportar| Archivo
```

IndexedDB y Cache Storage tienen responsabilidades diferentes. IndexedDB conserva los registros musicales y su identidad. La precaché conserva el código y los recursos propios necesarios para reabrir la aplicación sin conexión. El service worker y `OfflineController` no leen ni migran la biblioteca musical.

La navegación entre biblioteca, ficha, registro, retirados y respaldos depende del estado de React. Las aperturas de la PWA admiten la base del build, `index.html` y sus variantes con query o fragmento; no existe un router de fichas por URL o por ID. La distribución local utiliza `/`; el modo Pages utiliza `/Auditorium/`, con manifest, recursos, fallback y alcance verificados para esa base.

## 4. Organización del código y dependencias

```mermaid
flowchart TB
    Main["src/main.tsx<br/>Composición e inicio"]
    UI["src/app + src/ui<br/>Presentación y borradores"]
    App["src/application<br/>Casos de uso y consultas"]
    Domain["src/domain<br/>Contratos, reglas y validación"]
    Port["domain/repositories/local-repository.ts<br/>Puertos de persistencia"]
    Repo["infrastructure/repositories<br/>IndexedDbRepository"]
    DB["infrastructure/db<br/>Dexie, preflight, escritura y errores"]
    Browser["infrastructure/browser<br/>PWA y descarga de respaldo"]
    Main --> UI
    Main --> Repo
    Main --> Browser
    UI --> App
    UI --> Port
    UI -->|APIs del navegador| Browser
    UI -->|Códigos de error de almacenamiento| DB
    App --> Domain
    App --> Port
    Repo -.->|Implementa| Port
    Repo --> Domain
    Repo --> DB
```

Las flechas continuas indican uso o dependencia; la discontinua representa implementación de un contrato. El dominio y los casos de uso no importan React, Dexie ni el adaptador de persistencia. La interfaz sí conoce utilidades del navegador, el controlador offline y códigos de error de infraestructura para ofrecer mensajes y recuperación adecuados. Esta separación es por responsabilidades, con un puerto de almacenamiento; no supone independencia total de todos los adaptadores en la presentación.

| Área            | Responsabilidad y contrato                                                                            | Fuente                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composición     | Instancia repositorio y controlador offline, inicia este último y monta React; libera recursos en HMR | [main.tsx](../src/main.tsx)                                                                                                                         |
| Presentación    | Estado de carga/consulta, vistas internas, borradores, validación visible, confirmaciones y foco      | [App](../src/app/App.tsx), [LibraryPage](../src/ui/library/LibraryPage.tsx)                                                                         |
| Casos musicales | Registro, relaciones, listas, experiencia, valoraciones, propiedad, deseos y retirada                 | [MusicLibrary](../src/application/music-library.ts), [track-lists](../src/application/track-lists.ts)                                               |
| Consultas       | Proyección `LibraryAlbum`, búsqueda, filtros y orden sobre un snapshot local                          | [library-query](../src/application/library-query.ts)                                                                                                |
| Respaldos       | Exportación, lectura/validación de archivos y restauración delegada al repositorio                    | [LibraryBackups](../src/application/library-backups.ts)                                                                                             |
| Dominio         | Schemas Zod, invariantes entre colecciones, cambios puros y contratos de persistencia                 | [catalog](../src/domain/catalog/catalog.ts), [library](../src/domain/library/library.ts), [puertos](../src/domain/repositories/local-repository.ts) |
| Persistencia    | Apertura compatible, identidad, snapshots validados y transacciones atómicas                          | [IndexedDbRepository](../src/infrastructure/repositories/indexeddb-repository.ts), [database](../src/infrastructure/db/database.ts)                 |
| Navegador       | Capacidades PWA/almacenamiento y descarga de Blob JSON                                                | [OfflineController](../src/infrastructure/browser/offline-controller.ts), [backup-download](../src/infrastructure/browser/backup-download.ts)       |

### Puerto de persistencia

`LocalRepository` ofrece `open`, `readSnapshot` y `close`. `TransactionalLocalRepository` añade `mutate`, con una transformación síncrona sobre un `LocalSnapshot`; devuelve su resultado después del commit. `BackupLocalRepository` añade `restoreEmpty(snapshot, expectedIdentity)` para el único flujo que puede adoptar otra identidad.

Los casos musicales reciben `TransactionalLocalRepository`. `LibraryBackups` y la presentación reciben el contrato ampliado de respaldos. Las pruebas pueden inyectar instancias y generadores de IDs/fechas; la implementación habitual usa UUID y fechas del dispositivo. Los contratos no incorporan transporte HTTP ni autenticación de cuenta.

## 5. Flujo de una escritura musical

El siguiente flujo representa guardar una valoración; registro, listas y otras operaciones utilizan el mismo límite transaccional, con sus propias reglas y comprobaciones de concurrencia.

```mermaid
sequenceDiagram
    actor Persona
    participant UI as Formulario React
    participant Caso as MusicLibrary
    participant Repo as IndexedDbRepository
    participant DB as IndexedDB
    Persona->>UI: Guardar valoración
    UI->>UI: Validar borrador y bloquear envíos repetidos
    UI->>Caso: rateAlbum(entrada, nota)
    Caso->>Caso: Validar ID y convertir nota a scoreUnits
    Caso->>Repo: mutate(transformación síncrona)
    Repo->>Repo: Abrir esquema e identidad si corresponde
    Repo->>DB: Iniciar transacción rw
    Repo->>DB: Leer snapshot vigente
    Repo->>Repo: Clonar, aplicar cambio y validar todo el resultado
    alt Cambio o escritura inválidos
        Repo->>DB: Abortar transacción
        Repo-->>Caso: Error, datos previos conservados
        Caso-->>UI: Error de la operación
        UI-->>Persona: Mensaje y borrador para revisar o reintentar
    else Cambio válido
        Repo->>DB: Escribir diferencias por clave
        DB-->>Repo: Commit
        Repo-->>Caso: Resultado confirmado
        Caso-->>UI: Operación completada
        UI->>Repo: readSnapshot()
        Repo-->>UI: Snapshot validado o error de lectura
        UI-->>Persona: Resultado y estado de recuperación
    end
```

La apertura e inicialización de identidad pueden preceder a la transacción de negocio. Dentro de esta última, leer el estado vigente, transformar, validar y escribir forman una operación atómica. Las mutaciones musicales conservan `userId` y `createdAt`; ninguna realiza I/O externo dentro del callback. El detalle de índices, diferencias y rollback está en [modelo de datos](MODELO_DATOS.md).

La interfaz distingue fallo antes del commit de fallo al actualizar la vista después del commit. Cuando la escritura ya fue confirmada, recupera la lectura sin repetirla. Las confirmaciones destructivas y los editores que requieren referencia previa comprueban su destino dentro de la transacción; no existe un número global de revisión o un protocolo de sincronización entre dispositivos.

## 6. PWA y actualización de recursos

El registro se inicia explícitamente desde el punto de composición. La precarga incluye HTML, JS/CSS compilados, manifest e iconos y recursos visuales propios seleccionados en el [diseño base](DISENO_BASE.md). La configuración mantiene `runtimeCaching: []`, `skipWaiting: false` y `clientsClaim: true`; el service worker de desarrollo está desactivado. Tema y ambientación se guardan como preferencias opcionales de presentación en localStorage. La vista previa de una foto local sólo vive en memoria durante la apertura; ninguna de estas opciones modifica IndexedDB ni el respaldo musical.

```mermaid
sequenceDiagram
    actor Persona
    participant App as Ventanas de Auditorium
    participant Browser as Navegador
    participant SW as Nuevo service worker
    participant Host as Servidor estático
    Persona->>App: Comprobar actualización
    App->>Browser: registration.update()
    Browser->>Host: Consultar worker y recursos
    Browser->>SW: Instalar y precargar
    alt Precarga falla
        App-->>Persona: Error, versión anterior disponible
    else Nueva versión preparada
        SW-->>Browser: Worker instalado en espera
        App-->>Persona: Guardar cambios y cerrar todas las ventanas
        Persona->>App: Guardar y cerrar ventanas controladas
        Browser->>SW: Activar cuando no queden clientes anteriores
        Persona->>Browser: Reabrir Auditorium
        SW-->>App: Entregar recursos de la versión activa
    end
```

La aplicación no envía `SKIP_WAITING` ni fuerza una recarga. `clientsClaim` facilita el control inicial tras la activación y no salta la espera de actualizaciones. Workbox administra las entradas de su propia precaché; no se activa una limpieza general de otras cachés. Actualizar estos recursos no sustituye una migración de IndexedDB ni una restauración de datos.

`OfflineController` publica estado de red, recursos preparados, actualización, instalación y almacenamiento. La solicitud `persist()` requiere una acción de la persona. Que la aplicación pueda funcionar offline o que el navegador conceda persistencia no garantiza conservación ante limpieza manual o pérdida del dispositivo. Véanse [PWA](PWA_OFFLINE.md) y [ADR-006](adr/006-actualizaciones-pwa.md).

## 7. Compilación, distribución y entorno

```mermaid
flowchart LR
    Fuente["Código, estilos, manifest e iconos"]
    Build["TypeScript + Vite<br/>React, Tailwind y Vite PWA"]
    Dist["dist/<br/>Archivos estáticos y service worker"]
    Package["scripts/package.mjs<br/>Guías, changelog, avisos e inventario SHA-256"]
    Release["Paquete ZIP versionado<br/>GitHub Release"]
    Fuente --> Build --> Dist --> Package --> Release
```

El navegador ejecuta React, Zod, Dexie y los recursos de Workbox compilados. Node y npm son herramientas de desarrollo/compilación o para iniciar el servidor de revisión; no son un servicio de datos de Auditorium. La configuración de Vite separa Dexie en un chunk de almacenamiento, también incluido en la precarga de la PWA.

La [guía de entrega](ENTREGA_MVP.md) explica requisitos, apertura del ZIP y alojamiento. La release distribuye archivos para raíz. El hito WEB-01 añade una [publicación web en GitHub Pages](PUBLICACION_WEB.md) desde revisiones validadas de `main`, con build separado para `/Auditorium/`. El paquete base de v1.0.0 conserva sus guías y evidencia; la documentación técnica vigente se mantiene en el repositorio.

Fuentes: [package.json](../package.json), [vite.config.ts](../vite.config.ts), [empaquetado](../scripts/package.mjs) y [flujo de calidad](../.github/workflows/calidad.yml).

## 8. Propiedades, límites y decisiones

| Propiedad                | Mecanismo y límite                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integridad local         | Validación de schemas y referencias en snapshots, índices seleccionados y commit/rollback transaccional                                                                            |
| Identidad estable        | Un registro local persistente; las operaciones musicales no lo sustituyen y un respaldo solo lo adopta en un destino vacío                                                         |
| Concurrencia             | Transacciones sobre estado vigente y comprobaciones específicas de contenido/valor esperado; sin suscripción automática a cambios de otras ventanas                                |
| Recuperación             | Errores conservan datos y ofrecen acciones explícitas; no se borra ni recrea una base incompatible automáticamente                                                                 |
| Uso offline              | Recursos propios preparados por service worker y datos en IndexedDB; portadas externas y consultas a sitios necesitan conexión                                                     |
| Privacidad del contenido | Biblioteca y respaldo procesados localmente; un respaldo JSON contiene información personal sin cifrado propio y debe guardarse fuera del repositorio público                      |
| Costo obligatorio        | El funcionamiento local no requiere una cuenta o servicio contratado; un proveedor de alojamiento futuro debe evaluarse por separado                                               |
| Escala                   | Lectura y validación del snapshot completo, búsqueda/proyección en memoria y escrituras diferenciales; sin medición de bibliotecas grandes que justifique garantías de rendimiento |

Las pruebas se distribuyen por dominio, aplicación, adaptador e interfaz; los E2E ejercitan producción, offline, migraciones y aceptación. La [matriz de validación](VALIDACION_MVP.md) registra cobertura y límites. La evaluación con lectores de pantalla, instalación en Safari/iOS real y rendimiento en hardware limitado siguen fuera de esa evidencia.

Las [decisiones de arquitectura](README.md#decisiones-de-arquitectura) explican almacenamiento local, separación álbum/edición/pista, costo, retirada, identidad del respaldo y espera de actualizaciones. Metadatos externos y cuentas/sincronización siguen como investigaciones del [plan de desarrollo](PLAN_DESARROLLO.md), con contratos y migraciones por definir.
