# 01 — Arquitectura por niveles

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Arquitectura del sistema por niveles

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

### Nivel 1 — Contexto y fronteras de ejecución

```text
[Persona] -> [Web/PWA React]
                    |
                    +--> [Casos de uso y dominio musical]
                    |                  |
                    |                  v
                    |          [Dexie / IndexedDB local]
                    |
                    +--> [Supabase opcional: cuenta / snapshot]
                    +--> [Enlaces oficiales / proveedores opcionales]
                    +--> [Respaldo JSON o ZIP con audio]
```

Una biblioteca local-first distingue catálogo, experiencia personal y colección. Permite registrar, valorar, enlazar, respaldar y, opcionalmente, sincronizar metadatos; el audio personal permanece por dispositivo y se traslada mediante respaldo completo.

### Nivel 2 — Componentes y responsabilidades

| Componente     | Responsabilidad                                   | Fuente                                          |
| -------------- | ------------------------------------------------- | ----------------------------------------------- |
| Dominio        | Catálogo, biblioteca, copias, deseos e integridad | [src/domain](../src/domain)                     |
| Audio          | Contratos y límites de adjuntos locales           | [src/domain/audio.ts](../src/domain/audio.ts)   |
| Respaldo       | Formato y compatibilidad del snapshot             | [src/domain/backup.ts](../src/domain/backup.ts) |
| Sincronización | Contratos de conflictos y checkpoints             | [src/domain/sync.ts](../src/domain/sync.ts)     |
| Interfaz       | Registro, consulta y reproducción                 | [src](../src)                                   |

Las flechas del contexto representan comunicación/flujo. No se deduce una dependencia de código o transacción compartida sólo porque dos componentes intercambien datos.

### Nivel 3 — Dominio, contratos y adaptadores

Dexie sobre IndexedDB: DB11/nativa110 en la documentación vigente. JSON/snapshot7 y ZIP1 son formatos diferentes. JSON/sync excluyen los bytes de audio; ZIP1 los incorpora con manifiesto e integridad. Las relaciones de dominio no implican FKs de servidor ni aislamiento criptográfico del navegador.

- La nota general y las notas por género son independientes; cambiar una no debe recalcular silenciosamente la otra.
- Retirar de la colección no equivale a borrar el álbum de catálogo ni las otras experiencias.
- Las operaciones conjuntas validan identidad, referencias y concurrencia antes de confirmar.

Consultar [04-base-de-datos.md](04-base-de-datos.md) para entidades, cardinalidades y representación; [05-motor-o-nucleo-de-negocio.md](05-motor-o-nucleo-de-negocio.md) para invariantes. En un prototipo, las piezas rotuladas propuestas no son clases implementadas.

### Nivel 4 — Despliegue y distribución

**Destino:** Escritorio + Webpage + APK en GitHub Releases.

```text
[Revisión de fuente] -> [Verificación de su plataforma] -> [Build / artefacto]
                                                                  |
                                                          [Instalación / hosting]
                                                                  |
                                                          [Usuario y sus datos]
```

La persistencia y los servicios del contexto anterior conservan sus propias fronteras. Distribuir un APK no incorpora automáticamente el servidor, una PWA no acredita un instalador y el firmware requiere dispositivo. El capítulo [09-instalacion-y-despliegue.md](09-instalacion-y-despliegue.md) concreta la puesta en marcha.

### Calidad y límites arquitectónicos

- Evicción/cuota y cambio de origen del navegador
- Conflictos entre bibliotecas y compatibilidad de restauración
- Términos y disponibilidad de servicios musicales
- Audio o datos locales trasladados incorrectamente al empaquetar

No se publican garantías de latencia, disponibilidad o escala sin medición para la revisión/entorno concretos. Un diagrama explica responsabilidades; no es una certificación de ejecución o seguridad del servicio desplegado.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
