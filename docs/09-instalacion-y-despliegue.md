# 09 — Puesta en marcha y distribución

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Puesta en marcha y distribución por plataforma

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

**Destinos:** Escritorio + Webpage + APK en GitHub Releases.

Entorno declarado: engines `{"node": "^24.15.0 || >=26.0.0", "npm": "^12.2.0"}`; packageManager `npm@12.2.0`. No actualizar dependencias por redactar documentación.

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

Los comandos se enumeran desde archivos presentes; esta actualización documental no los ejecuta de nuevo ni certifica sus resultados. Estado de pruebas y CI se informa por revisión/fecha, separado de capacidades propuestas.

### Datos, servicios y distribución

Dexie sobre IndexedDB: DB11/nativa110 en la documentación vigente. JSON/snapshot7 y ZIP1 son formatos diferentes. JSON/sync excluyen los bytes de audio; ZIP1 los incorpora con manifiesto e integridad. Las relaciones de dominio no implican FKs de servidor ni aislamiento criptográfico del navegador.

Para APK: application ID estable, versión/código creciente, firma privada preservada, permisos y prueba en dispositivo; adjuntar APK y SHA-256 a la release. Para escritorio: distinguir portable/instalador y dependencias. Para web: base/rutas, servidor/servicios y cambio de origen. Para firmware: dispositivo, cableado, compilación y prueba física separados. Aplicar sólo los targets aprobados.

GitHub Releases no aloja el backend ni convierte un ZIP de fuentes en instalador. No hacer push como parte de una revisión documental: en proyectos con publicación automática desde main, ese push puede generar una nueva APK o despliegue.

### Recuperación

Conservar el artefacto anterior y su procedencia. Retroceder código no revierte automáticamente datos o migraciones. Revisar compatibilidad de guardado/snapshot y restauración antes de instalar una versión antigua. La aceptación debe identificar archivo/URL, commit, target, fecha y limitaciones.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->

<!-- DOCUMENTACION:evidencia-ci-2026-10-29:BEGIN -->

## Estado remoto consultado el 29 de octubre de 2026

Consulta para el commit `0dccf7cb865948d1b5178c9062fbe8171d98ea93`. Se leyó GitHub Actions; no se ejecutó de nuevo la aplicación ni se repitieron sus pruebas.

| Workflow | Estado    | Resultado | Evidencia                                                                          |
| -------- | --------- | --------- | ---------------------------------------------------------------------------------- |
| Calidad  | completed | success   | [Run 40812829211](https://github.com/NicoCG32/Auditorium/actions/runs/40812829211) |

Releases consultadas (no una comprobación nueva de instalación):

| Tag                                                                  | Canal                          | Adjuntos identificados               |
| -------------------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| [v1.1.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.1.0) | Publicada sin marca prerelease | auditorium-1.1.0.zip, SHA256SUMS.txt |
| [v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0) | Publicada sin marca prerelease | auditorium-1.0.0.zip, SHA256SUMS.txt |

<!-- DOCUMENTACION:evidencia-ci-2026-10-29:END -->
