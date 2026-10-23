# Plan de desarrollo de Auditorium

Versión 1.13 · 2026-10-22 · Estado: MVP v1.0.0 publicado; integraciones, navegación, cuentas, correo transaccional, composición de Biblioteca, enlaces personales y clasificación incorporados; ficha y experiencia conjunta implementadas en este incremento.

## Objetivo del producto

Construir una biblioteca musical personal que permita registrar qué álbumes se conocen, escuchan, poseen, califican y desean adquirir, con ediciones y ejemplares diferenciados. El MVP funciona localmente, admite altas manuales y mantiene un costo recurrente obligatorio de USD 0.

El MVP completo termina en Fase 4. Autenticación, sincronización, importaciones remotas automáticas y reproducción interna quedan fuera de ese alcance.

## Método de trabajo

[SYNC-01 #25](https://github.com/NicoCG32/Auditorium/issues/25) incorpora cuenta opcional con correo y contraseña y biblioteca privada entre dispositivos mediante Supabase gratuito. [AUTH-02 #77](https://github.com/NicoCG32/Auditorium/issues/77) completa el correo transaccional con Brevo Free y la validación real de registro, confirmación y recuperación. [AUTH-03 #78](https://github.com/NicoCG32/Auditorium/issues/78) trata los intercambios PKCE caducados y los retornos sin verificador con un aviso, limpieza de URL y reintento, conservando sesiones y bibliotecas. Los refinamientos visuales pendientes conservan sus criterios y dependencias. La [guía de sincronización](SINCRONIZACION_SUPABASE.md) y [ADR-011](adr/011-supabase-sincronizacion.md) concretan esta ampliación posterior al MVP. Continúa el trabajo sobre main, sin crear un sprint o fechas comprometidas.

Se adopta una planificación ligera inspirada en Scrum: backlog ordenado, objetivo por sprint, incremento verificable, revisión y retrospectiva. Es una adaptación para el tamaño actual del proyecto. La referencia es la [Guía Scrum](https://scrumguides.org/scrum-guide.html).

[VIS-02 #63](https://github.com/NicoCG32/Auditorium/issues/63) concreta la [Biblioteca](BIBLIOTECA.md): búsqueda y música prioritarias, utilidades y filtros plegables, selecciones extraíbles, tarjetas accesibles y regreso con contexto. [LINK-01 #64](https://github.com/NicoCG32/Auditorium/issues/64) incorpora los [enlaces personales](ENLACES_PERSONALES.md), favorito opcional y guardado conjunto con respaldo 4/DB7 y sincronización compatible. [UX-05 #65](https://github.com/NicoCG32/Auditorium/issues/65) concreta la [clasificación y los formularios](CLASIFICACION_ALBUM.md), con migración DB8/respaldo5 y compatibilidad remota; [UX-06 #66](https://github.com/NicoCG32/Auditorium/issues/66) concreta [ficha y experiencia conjunta](MI_EXPERIENCIA.md), edición de referencia opcional y compatibilidad DB9/respaldo6. El siguiente alcance es MEDIA-01 #67, evaluación de metadatos desde enlaces y reproducción oficial por proveedor.

Una fase es un hito de producto y puede abarcar varios sprints. Se propone una duración de una semana por sprint; sus fechas y capacidad se fijan cuando comienza. El backlog inicial no representa una promesa de fechas ni autoriza ejecutar todas las fases.

- **Responsable de producto:** fija prioridades, alcance y criterios de valor.
- **Responsabilidad de desarrollo:** concreta el plan técnico y entrega con evidencia.
- **Facilitación del proceso:** mantiene el backlog entendible, visibiliza bloqueos y registra mejoras.

No se asignan personas ni calendarios hasta acordar disponibilidad.

## Fuente de seguimiento

[GitHub Projects — Auditorium](https://github.com/users/NicoCG32/projects/4) organiza el backlog; las issues contienen alcance, criterios de aceptación y dependencias. Los milestones representan fases. Este documento conserva el método y los criterios generales, mientras el estado de ejecución se mantiene en el Project.

Cada issue incluye identificador estable, resultado esperado, fase, prioridad, dependencias y checklist verificable. Las PR enlazan las issues y describen el comportamiento y la validación. El plan usa las capacidades de [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects).

## Flujo y límites

**Backlog → Preparado → En curso → En revisión → Terminado.**

- **Backlog:** resultado definido, pendiente de refinamiento o dependencias.
- **Preparado:** alcance y aceptación claros, dependencias resueltas y tamaño abordable.
- **En curso:** trabajo activo dentro del hito solicitado.
- **En revisión:** resultado disponible con evidencia; falta revisión o integración.
- **Terminado:** criterios comprobados y cambio integrado, o decisión documentada cuando no hay código.
- **Bloqueado:** falta concreta que impide avanzar; registrar causa y condición para resolverla.

Límite inicial: una issue en curso y una en revisión. Un bloqueo conserva el trabajo visible; no justifica empezar múltiples tareas sin priorización. Preparado no significa que el sprint haya empezado ni que el alcance esté autorizado. El incremento AI-01/CAT-01 es una excepción explícita de dos issues coordinadas para las dos capacidades solicitadas; comparten revisión y validación de compatibilidad. Su refinamiento UX-01 comparte PR. La revisión posterior del recorrido se planifica como UX-02, con una única tarea de ejecución activa al comenzar por UX-03; no se inicia sincronización.

## Priorización y refinamiento

- **P0:** bloquea la entrega o protege integridad esencial.
- **P1:** completa el flujo principal y su usabilidad.
- **P2:** evolución posterior al MVP.

El campo Orden expresa la secuencia inicial; las dependencias prevalecen. Refinar el sprint próximo y mantener el futuro con menor detalle. Las estimaciones se incorporan al refinar y no se confunden con fechas. Dividir una issue si no cabe en un sprint o no tiene un resultado comprobable.

## Definición de preparado

1. Resultado y alcance explícitos; sin decisiones críticas escondidas.
2. Criterios observables y datos de ejemplo ficticios cuando se necesiten.
3. Dependencias completadas o resolución incluida en el mismo hito.
4. Tamaño compatible con la capacidad del sprint.
5. Forma de validar y límites conocidos definidos.

## Definición de terminado

1. Criterios de aceptación de la issue satisfechos y comprobados.
2. Reglas del dominio preservadas; pruebas necesarias de negocio y flujo crítico.
3. Lint, typecheck, test y build satisfactorios cuando existan; E2E en los hitos que lo requieren.
4. Verificación manual pertinente de errores, estados vacíos, teclado y responsive.
5. Sin errores críticos conocidos ni regresiones pendientes del alcance.
6. Documentación de producto y contratos/migraciones actualizados cuando cambien.
7. Cambio revisado e integrado en main antes de cerrar una issue de implementación; cuando se utiliza una PR, debe quedar revisada e integrada. El flujo actual trabaja directamente en main.
8. Sin secretos, datos personales reales, rutas locales ni registros internos en artefactos públicos.

Una tarea documental se valida por coherencia, enlaces y alcance; no requiere ejecutar pruebas inexistentes. Una investigación termina con evidencia y una decisión/propuesta, no con una integración implícita.

## Cadencia de sprint

1. **Planificación:** seleccionar objetivo único y issues preparadas según capacidad; registrar inicio y fin.
2. **Seguimiento breve:** al trabajar, actualizar avance, próximo paso y bloqueos; ajustar el plan manteniendo el objetivo.
3. **Refinamiento:** resolver dudas del próximo trabajo y dividir historias demasiado grandes.
4. **Revisión:** demostrar el incremento y comprobar aceptación; trabajo incompleto vuelve al backlog sin marcarlo terminado.
5. **Retrospectiva:** registrar qué funcionó, qué obstaculizó y una mejora concreta para el siguiente sprint.

No se programan reuniones ni recordatorios automáticamente. Se registran resultados cuando ocurre cada evento.

## Roadmap

| Fase | Objetivo                  | Condición de salida                                                                                      |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0    | Base ejecutable y calidad | Plantilla local, TS estricto, scripts operativos, estilos base y decisiones técnicas                     |
| 1    | Dominio y persistencia    | Casos de uso locales, integridad, identidad estable y transacciones probadas                             |
| 2    | Biblioteca y altas        | Crear → guardar → buscar → abrir → calificar, con persistencia                                           |
| 3    | Ediciones y colección     | Pistas, variantes, copias y deseos con reglas independientes                                             |
| 4    | MVP utilizable            | Respaldo/restauración, PWA/offline, migraciones y validación completa                                    |
| 5    | Integraciones opcionales  | Evaluación de fuentes, selección revisada y recomendaciones, con privacidad y compatibilidad verificadas |
| 6    | Sincronización            | Prueba técnica de identidad, permisos, conflictos, migración y costos                                    |

No publicar una fase anterior a la 4 como MVP completo. El despliegue es un hito separado y debe especificar proveedor, condiciones vigentes y validación. WEB-01 concreta la [web/PWA en GitHub Pages](PUBLICACION_WEB.md), con biblioteca local y conservación de la distribución raíz.

## Primer sprint propuesto — registro inicial

**S01 — Base ejecutable.** Objetivo: disponer de una plantilla que arranque y pase sus verificaciones, preparada para desarrollar el dominio.

Candidatos originales: BASE-01, BASE-02 y BASE-03. Esta propuesta se registró antes de implementar la base; las Fases 0–4 ya están completadas en el MVP v1.0.0. No hay un sprint activo ni fechas comprometidas para las fases siguientes; su selección se mantiene en el Project.

## Decisiones por hito

- **Fase 1, implementada:** enteros de 2 a 20 para ratings, fechas y opcionales explícitos, identidad local concurrente y validación de referencias.
- **Fase 3, implementada:** deseos por formato/edición y compatibilidad entre edición y ejemplar.
- **Fase 4, implementada:** consecuencias de eliminar, identidad en restauración, snapshots, rollback y evolución del esquema.
- **Fases 5–6:** verificar derechos, licencias, cuotas y migraciones antes de elegir integraciones.

## Control de cambios y progreso

Cambios de alcance se reflejan primero en la issue y el objetivo del hito. Cambios arquitectónicos relevantes se documentan con un ADR de producto. Nuevas funciones fuera del MVP permanecen en backlog futuro hasta solicitar su desarrollo.

Las releases se preparan como tareas de entrega con su propio milestone, sin reabrir una fase ya completada. [REL-01](https://github.com/NicoCG32/Auditorium/issues/47) publica el MVP `1.0.0`: versión coherente, changelog, CI del commit exacto, paquete revisado, tag anotado y descarga con checksum verificado. Publicar una release distribuye los archivos; alojar el sitio requiere el hito opcional de despliegue. La issue de release se cierra después de comprobar la publicación y sus assets.

[DOC-01](https://github.com/NicoCG32/Auditorium/issues/49) consolida las [referencias técnicas del MVP](README.md): arquitectura, dominio y datos, con diagramas y trazabilidad al código. Se sigue en un milestone documental propio; su integración no modifica el tag ni los archivos de la release publicada.

[WEB-01](https://github.com/NicoCG32/Auditorium/issues/52) publica la aplicación en GitHub Pages. Se prioriza por solicitud de publicación sobre la investigación siguiente, manteniendo EXT-01 en su revisión independiente. Requiere validar raíz y subdirectorio, integrar la PR y comprobar el sitio HTTPS real antes de cerrar el hito; no amplía el alcance a cuentas o sincronización.

[VIS-01](https://github.com/NicoCG32/Auditorium/issues/54) adapta la identidad visual después de WEB-01, con marca, temas oscuro/pergamino, ambientación desactivable y vista previa temporal de foto local. Se priorizó por solicitud de producto y se completó con un milestone propio. La publicación se verificó con ambos temas, recursos offline y actualización desde la versión anterior, conservando el dominio y los datos musicales.

[EXT-01](https://github.com/NicoCG32/Auditorium/issues/24) completó la evaluación de MusicBrainz mediante una [propuesta de metadatos externos](METADATOS_EXTERNOS.md) y una prueba offline ficticia. El resultado define correspondencias, pérdidas de representación, condiciones de uso y requisitos previos. La propuesta de importador JSON de ediciones continúa pendiente; el estudio no habilita ese importador ni inicia sincronización.

El hito **Integraciones — Recomendaciones y catálogo** coordina [CAT-01 #57](https://github.com/NicoCG32/Auditorium/issues/57) y [AI-01 #56](https://github.com/NicoCG32/Auditorium/issues/56), ambos Fase 5/P1, sin sprint ni fechas comprometidas. CAT-01, orden 26.1, incorpora búsqueda Wikidata explícita, selección humana, referencias opcionales y conservación del registro manual. AI-01, orden 26.2, incorpora un orden de escucha/revaloración con Gemini o Groq, clave propia sólo en memoria y contexto mínimo. La nueva capacidad amplía el producto después del MVP; no cambia retrospectivamente su alcance. La [ADR-008](adr/008-integraciones-opcionales.md) documenta las decisiones y la [guía de integraciones](INTEGRACIONES_OPCIONALES.md) sus límites.

[UX-01 #59](https://github.com/NicoCG32/Auditorium/issues/59), Fase 5/P1 y orden 26.3, refina el flujo dentro de la misma [PR #58](https://github.com/NicoCG32/Auditorium/pull/58), devuelta a borrador. Añade edición del álbum con identidad estable y control de concurrencia, géneros libres, país por artista y portada automática por URL o archivo JPEG/PNG local. AI-01/CAT-01 y UX-01 conservan su seguimiento en revisión, sin sprint ni fechas comprometidas. La [ADR-009](adr/009-edicion-metadatos-portadas.md) documenta el cambio de interacción y la evolución de datos. La validación técnica previa no sustituye la revisión de claridad del recorrido.

[UX-02 #60](https://github.com/NicoCG32/Auditorium/issues/60) coordina el hito **Experiencia — Biblioteca, calificaciones y Mi colección**. [UX-03 #61](https://github.com/NicoCG32/Auditorium/issues/61), Fase 2/P1 y orden 26.41, define la [navegación y experiencia propuestas](EXPERIENCIA_USUARIO.md), [contratos independientes](CONTRATOS_EXPERIENCIA.md), [bocetos](prototipos/experiencia/index.html) y [ADR-010](adr/010-navegacion-experiencia.md). Es diseño en revisión progresiva, sin cambiar runtime, DB5 ni respaldo3. La secuencia del núcleo continúa con navegación/borradores, composición visual de Biblioteca, enlaces personales, alta/edición, ficha/calificaciones, Mi colección y validación de comprensión. Mi colección es el último destino principal y diferencia Físico / Digital adquirido; utilidades y deseos conservan acceso secundario.

El refinamiento de clasificación se implementa en [UX-05 #65](https://github.com/NicoCG32/Auditorium/issues/65): tipo principal, categorías múltiples y estado de publicación del álbum, con migración del enum mixto actual y respaldo versionado. Deluxe/Especial/Aniversario siguen en la edición física o digital; [COL-05 #71](https://github.com/NicoCG32/Auditorium/issues/71) distingue esa edición de cada copia poseída. No se requiere poseer, escuchar o calificar para clasificar un álbum.

El diseño mantiene un solo álbum y una sola nota personal por identidad musical. [UX-06 #66](https://github.com/NicoCG32/Auditorium/issues/66) incorpora un selector opcional de edición de referencia entre las ediciones ya añadidas al mismo álbum, sin exigir adquisición ni generar notas por edición, con persistencia/respaldo versionados y datos anteriores sin selección inventada. COL-05 presenta **Mi colección**, con Físico y Digital adquirido diferenciados y deseos secundarios. Los bocetos previos todavía no incorporan estos dos refinamientos, documentados en UX-03.

[UX-04 #62](https://github.com/NicoCG32/Auditorium/issues/62) implementa la [base de navegación y borradores](NAVEGACION.md): rutas por fragmentos, historial protegido, contexto y regreso, índices iniciales de Calificaciones/Mi colección, y guardado o descarte explícito. El alta abre su ficha después de la lectura confirmada; un fallo posterior al commit sólo reintenta lectura. No cambia DB5/respaldo3 ni implementa las ampliaciones de las tareas siguientes. La composición final de Biblioteca, editores y colección mantiene su seguimiento propio.

El hito **Reproducción — Servicios compatibles y audio local** sigue MEDIA-01/PLAY-01 y AUDIO-01/AUDIO-02 de forma independiente. La viabilidad de metadatos desde URL, inserción oficial, formatos de archivo, persistencia y respaldo debe concretarse antes de implementar cada capacidad. La investigación no bloquea el registro manual ni los enlaces externos. Los nuevos hitos representan incrementos que abarcan áreas de fases anteriores; no reabren sus milestones históricos ni modifican retrospectivamente el MVP. Las dependencias, estados y orden vigentes se mantienen en el Project, sin sprint nuevo activo ni fechas comprometidas.

El incremento exige compatibilidad de DB5/respaldo3 con datos y respaldos anteriores estrictos, rechazo de referencias desconocidas, errores y cancelación, ausencia de claves persistidas, acceso manual y portadas locales offline y revisión de los flujos. Los criterios de UX-01 incorporan persistencia tras recarga, edición sin pérdida de relaciones, conflicto concurrente, validación de archivos, filtros/orden y accesibilidad. La generación autenticada real depende de configurar una clave propia; las pruebas controladas no acreditan cuota o calidad de una cuenta. [SYNC-01 #25](https://github.com/NicoCG32/Auditorium/issues/25) se prioriza como Fase 6/P1, orden 27, autorizada posteriormente como prioridad de cuenta y biblioteca entre dispositivos.

Seguir issues terminadas frente a seleccionadas, bloqueos abiertos y evidencia de aceptación. No medir progreso por líneas de código ni usar porcentajes sin una base acordada.

## Plantilla de issue

- Identificador y resultado esperado.
- Alcance incluido y excluido.
- Fase y prioridad.
- Criterios de aceptación.
- Dependencias.
- Evidencia de validación al completar.
