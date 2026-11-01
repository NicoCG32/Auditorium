# Arquitectura de Auditorium

**Referencias de implementación:** `src/main.tsx`, `src/app/App.tsx`, `src/application/`, `src/domain/`, `src/infrastructure/`, `src/ui/`, `vite.config.ts` y `supabase/migrations/`.

Auditorium se distribuye como sitio estático. Los casos de uso y la mayoría de los datos viven en el navegador; la cuenta remota es **opcional**.

## Nivel 1 — Contexto del sistema

```mermaid
flowchart LR
    PERSONA["Persona que organiza su música"]
    APP["Auditorium · web/PWA"]
    RESPALDO[("Archivo JSON o ZIP")]
    CLOUD["Supabase · cuenta y snapshots"]
    WIKIDATA["Wikidata · búsqueda opcional"]
    IA["Gemini o Groq · recomendación opcional"]
    PLAYER["Spotify / YouTube / sitios enlazados"]
    PERSONA -->|usa| APP
    APP <-->|exporta / importa manualmente| RESPALDO
    APP <-->|sincroniza si se configura| CLOUD
    APP -.->|consulta explícita| WIKIDATA
    APP -.->|clave y solicitud explícitas| IA
    APP -.->|abre o carga por elección| PLAYER
    classDef core fill:#263244,color:#fff,stroke:#8d343a,stroke-width:2px;
    classDef optional fill:#f3eee6,color:#2c3036,stroke:#8d343a,stroke-dasharray:4 3;
    class APP core;
    class CLOUD,WIKIDATA,IA,PLAYER optional;
```

**Frontera importante:** el sitio estático no almacena la colección por defecto. Supabase puede recibir un snapshot de metadatos al iniciar sesión y sincronizar, pero el audio no sale en ese snapshot. Las peticiones a proveedores musicales no son equivalentes a importar ni a copiar catálogos automáticamente.

## Nivel 2 — Contenedores de ejecución

```mermaid
flowchart TB
    USER["Persona / navegador"]
    HOST["GitHub Pages u otro hosting estático HTTPS"]
    subgraph BROWSER["Navegador de la persona"]
      SPA["SPA React y TypeScript"]
      CORE["Casos de uso + dominio"]
      DEXIE["Repositorio Dexie"]
      DB[("IndexedDB · catálogo, biblioteca y audio")]
      SW["Service worker PWA"]
      CACHE[("Cache Storage · recursos de la app")]
      MEM["Estado transitorio · claves de IA / borradores"]
      SPA --> CORE --> DEXIE --> DB
      SPA --> MEM
      SPA <--> SW --> CACHE
    end
    HOST -->|HTML, JS, CSS, manifiesto| USER --> SPA
    CORE -.->|snapshot sin bytes de audio| REMOTE[("Supabase Auth + PostgreSQL")]
    SPA -.->|consultas, embeds, portadas| EXTERNAL["Proveedores externos"]
    classDef primary fill:#263244,color:#fff,stroke:#8d343a;
    classDef storage fill:#f3eee6,color:#263244,stroke:#7a6a5d,stroke-width:2px;
    class SPA,CORE,DEXIE primary;
    class DB,CACHE,REMOTE storage;
```

Los diagramas muestran **responsabilidades lógicas**, no procesos independientes dentro de un mismo navegador. La PWA permite utilizar recursos precargados sin conexión; las APIs remotas, portadas por URL y servicios de streaming siguen necesitando red.

## Nivel 3 — Componentes y dependencias

```mermaid
flowchart LR
    subgraph UI["Presentación"]
      VIEWS["src/ui · formularios, ficha, biblioteca"]
      NAV["Navegación y borradores"]
    end
    subgraph APPLICATION["Aplicación"]
      USE["src/application · MusicLibrary, Sync, imports, respaldo"]
    end
    subgraph DOMAIN["Dominio puro"]
      CAT["Catálogo y relaciones"]
      LIB["Biblioteca personal, notas y colección"]
      CONTRACTS["Validación Zod y contratos"]
    end
    subgraph ADAPTERS["Infraestructura"]
      LOCAL["Repositorio local + Dexie"]
      AUDIO["Archivos, navegador y reproductor"]
      REMOTE["Supabase, Wikidata, Gemini/Groq"]
    end
    VIEWS --> NAV
    VIEWS --> USE
    NAV --> USE
    USE --> CAT & LIB & CONTRACTS
    USE --> LOCAL
    VIEWS --> AUDIO
    USE -.-> REMOTE
    LOCAL --> IDB[(IndexedDB)]
    classDef head fill:#263244,color:#fff,stroke:#8d343a;
    class VIEWS,USE,CAT,LIB,LOCAL head;
```

Las respuestas de servicios externos se revisan antes de incorporarlas al catálogo. Las ediciones, restauraciones y sincronizaciones pasan por validaciones de identidad, integridad y concurrencia.

| Responsabilidad            | Código de referencia                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orquestación y operaciones | [`src/application/`](../../src/application/)                                                                                                                               |
| Entidades y reglas         | [`src/domain/`](../../src/domain/)                                                                                                                                         |
| Persistencia local         | [`src/infrastructure/db/database.ts`](../../src/infrastructure/db/database.ts), [`indexeddb-repository.ts`](../../src/infrastructure/repositories/indexeddb-repository.ts) |
| Audio y archivos           | [`src/domain/audio.ts`](../../src/domain/audio.ts), [`src/infrastructure/db/audio-store.ts`](../../src/infrastructure/db/audio-store.ts)                                   |
| Cuenta y sincronización    | [`src/application/library-sync.ts`](../../src/application/library-sync.ts), [`src/infrastructure/supabase/client.ts`](../../src/infrastructure/supabase/client.ts)         |
| Interfaz                   | [`src/ui/`](../../src/ui/)                                                                                                                                                 |

## Nivel 4 — Despliegue actual y destinos futuros

```mermaid
flowchart TB
    SOURCE["Código + pruebas"] --> CI["GitHub Actions · calidad"]
    CI -->|build:pages| STATIC["Artefacto web estático"]
    STATIC --> PAGES["GitHub Pages / hosting HTTPS"]
    PAGES --> DEVICE["Navegador + PWA instalable"]
    DEVICE --> IDB[("IndexedDB por origen y perfil")]
    CONFIG["Configuración pública en build"] -.-> STATIC
    DEVICE -.->|si se configuró y el usuario inicia sesión| SUPA["Proyecto Supabase + migraciones SQL"]
    FUTURE["Futuro: paquetes de escritorio y Android"]
    classDef actual fill:#263244,color:#fff,stroke:#8d343a;
    classDef future fill:#f3eee6,color:#333,stroke:#8d343a,stroke-dasharray:5 5;
    class STATIC,DEVICE actual;
    class FUTURE future;
```

**Consecuencia:** el mismo usuario que entra desde otro dominio, subdominio o perfil no ve automáticamente su IndexedDB anterior. Una actualización de código tampoco garantiza que un almacenamiento migrado pueda abrirse con una versión más antigua.

[Índice](../README.md) · [Datos](03-datos-y-persistencia.md) · [Flujos](04-flujos-y-estados.md)
