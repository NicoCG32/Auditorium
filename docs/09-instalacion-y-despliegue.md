# 09 — Puesta en marcha y distribución

## Puesta en marcha y distribución por plataforma

**Disponibilidad:** Aplicación web/PWA para gestionar una fonoteca personal. Las versiones de escritorio y Android están previstas como entregas independientes.

**Destinos:** Escritorio + Webpage + APK en GitHub Releases.

Entorno declarado: engines `{"node": "^24.15.0 || >=26.0.0", "npm": "^12.2.0"}`; packageManager `npm@12.2.0`. Instala las versiones fijadas en el lockfile.

| Script existente | Definición en package.json                  |
| ---------------- | ------------------------------------------- |
| dev              | `vite --host 127.0.0.1`                     |
| lint             | `eslint . --max-warnings 0`                 |
| typecheck        | `tsc -b`                                    |
| test             | `vitest run`                                |
| test:e2e         | `playwright test`                           |
| format:check     | `prettier --check .`                        |
| build            | `tsc -b && vite build`                      |
| package          | `npm run build && node scripts/package.mjs` |
| preview          | `vite preview --host 127.0.0.1`             |

### Secuencia de puesta en marcha

1. Preparar el runtime/editor y la configuración que indiquen las fuentes enlazadas; usar valores de prueba y restaurar el lockfile apropiado.
2. Ejecutar la modalidad local y sus comprobaciones existentes desde la carpeta indicada por esa guía. No confundir preview web con el runtime nativo o montaje físico.
3. Construir/instalar el artefacto de ese target y comprobar recorrido principal, error relevante y reapertura/actualización antes de declararlo entregado.

Ejecuta los comandos de comprobación antes de distribuir una compilación. Puedes consultar sus resultados remotos en la pestaña Actions del repositorio.

### Datos, servicios y distribución

Dexie sobre IndexedDB: DB11/nativa110 en la documentación vigente. JSON/snapshot7 y ZIP1 son formatos diferentes. JSON/sync excluyen los bytes de audio; ZIP1 los incorpora con manifiesto e integridad. Las relaciones de dominio no implican FKs de servidor ni aislamiento criptográfico del navegador.

La web se compila para el origen y prefijo donde se alojará. IndexedDB conserva la biblioteca por origen; cambiar de dominio requiere trasladarla mediante el respaldo adecuado. El escritorio y Android tendrán paquetes e instalación propios.

GitHub Releases distribuye los archivos de cada versión. Los servicios de servidor se despliegan por separado; consulta la guía de la plataforma para instalar o alojar la aplicación.

### Recuperación

Conservar el artefacto anterior y su procedencia. Retroceder código no revierte automáticamente datos o migraciones. Revisar compatibilidad de guardado/snapshot y restauración antes de instalar una versión antigua. Consulta las notas de la versión para conocer los requisitos y límites de la entrega.

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
