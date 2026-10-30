# 04 — Dominio, entidades y persistencia

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Dominio y representación de datos

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

### Entidades y conceptos

| Entidad / concepto          | Identidad y significado                                | Representación / estado                            |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| Album                       | Identidad de la obra musical, créditos y clasificación | Catálogo                                           |
| Edition / Track             | Edición y pistas diferenciadas del álbum abstracto     | Catálogo                                           |
| PersonalEntry               | Escucha, valoración y comentario de una biblioteca     | Biblioteca local                                   |
| OwnedItem                   | Copia física o digital adquirida                       | Biblioteca local                                   |
| PurchaseWish                | Intención de compra por formato/edición                | Biblioteca local                                   |
| AudioAttachment / AudioFile | Descriptor, asociación y bytes del archivo personal    | Dos colecciones locales; fuera del snapshot remoto |

### Relaciones de dominio

```text
[Album] -- 1:N --> [Edition]
[Edition] -- 1:N --> [Track]
[Biblioteca] -- 1:N --> [PersonalEntry]
[Album] -- 1:N --> [OwnedItem]
[AudioAttachment] -- 1:1 --> [AudioFile]
```

| Origen          | Cardinalidad / relación | Destino       | Semántica                                               |
| --------------- | ----------------------- | ------------- | ------------------------------------------------------- |
| Album           | 1:N                     | Edition       | Versiones editoriales de una misma obra                 |
| Edition         | 1:N                     | Track         | Lista de pistas                                         |
| Biblioteca      | 1:N                     | PersonalEntry | Experiencia independiente del catálogo                  |
| Album           | 1:N                     | OwnedItem     | Puede haber varias copias                               |
| AudioAttachment | 1:1                     | AudioFile     | Asociación local verificada; no un recurso de streaming |

### Persistencia y garantías

Dexie sobre IndexedDB: DB11/nativa110 en la documentación vigente. JSON/snapshot7 y ZIP1 son formatos diferentes. JSON/sync excluyen los bytes de audio; ZIP1 los incorpora con manifiesto e integridad. Las relaciones de dominio no implican FKs de servidor ni aislamiento criptográfico del navegador.

La cardinalidad de dominio no prueba que exista una FK física. Revisar adaptadores/migraciones para identificar qué se valida por esquema, por caso de uso o por lectura. No usar «RLS» para almacenamiento que no dispone de esas políticas.

### Consistencia y evolución

- La nota general y las notas por género son independientes; cambiar una no debe recalcular silenciosamente la otra.
- Retirar de la colección no equivale a borrar el álbum de catálogo ni las otras experiencias.
- Las operaciones conjuntas validan identidad, referencias y concurrencia antes de confirmar.
- El audio se limita por archivo, biblioteca y respaldo; no se copia al snapshot de sincronización.
- Las referencias externas son revisables; una recomendación no modifica por sí misma las valoraciones.

Cambios de formato, referencias y restauración se comprueban con datos de prueba. El respaldo/artefacto debe indicar versión; la documentación no autoriza transformar datos reales ni rebajar un esquema para abrirlo con un ejecutable anterior.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
