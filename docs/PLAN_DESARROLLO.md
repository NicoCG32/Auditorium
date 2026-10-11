# Plan de desarrollo de Auditorium

Versión 1.0 · 2026-10-11 · Estado: planificación inicial.

## Objetivo del producto

Construir una biblioteca musical personal que permita registrar qué álbumes se conocen, escuchan, poseen, califican y desean adquirir, con ediciones y ejemplares diferenciados. El MVP funciona localmente, admite altas manuales y mantiene un costo recurrente obligatorio de USD 0.

El MVP completo termina en Fase 4. Autenticación, sincronización, importaciones remotas automáticas y reproducción interna quedan fuera de ese alcance.

## Método de trabajo

Se adopta una planificación ligera inspirada en Scrum: backlog ordenado, objetivo por sprint, incremento verificable, revisión y retrospectiva. Es una adaptación para el tamaño actual del proyecto. La referencia es la [Guía Scrum](https://scrumguides.org/scrum-guide.html).

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

Límite inicial: una issue en curso y una en revisión. Un bloqueo conserva el trabajo visible; no justifica empezar múltiples tareas sin priorización. Preparado no significa que el sprint haya empezado ni que el alcance esté autorizado.

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
7. PR revisada e integrada antes de cerrar una issue de implementación.
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

| Fase | Objetivo | Condición de salida |
|---|---|---|
| 0 | Base ejecutable y calidad | Plantilla local, TS estricto, scripts operativos, estilos base y decisiones técnicas |
| 1 | Dominio y persistencia | Casos de uso locales, integridad, identidad estable y transacciones probadas |
| 2 | Biblioteca y altas | Crear → guardar → buscar → abrir → calificar, con persistencia |
| 3 | Ediciones y colección | Pistas, variantes, copias y deseos con reglas independientes |
| 4 | MVP utilizable | Respaldo/restauración, PWA/offline, migraciones y validación completa |
| 5 | Metadatos externos | Investigación y propuesta antes de cualquier integración |
| 6 | Sincronización | Prueba técnica de identidad, permisos, conflictos, migración y costos |

No publicar una fase anterior a la 4 como MVP completo. El despliegue es un hito opcional separado y debe especificar proveedor, condiciones vigentes y validación.

## Primer sprint propuesto

**S01 — Base ejecutable.** Objetivo: disponer de una plantilla que arranque y pase sus verificaciones, preparada para desarrollar el dominio.

Candidatos: BASE-01, BASE-02 y BASE-03. Requiere integrar el plan (PLAN-01) y refinar la capacidad. No hay fecha de inicio ni sprint activo. El alcance puede dividirse durante la planificación; no incorporar dominio, cuentas ni servicios externos.

## Decisiones que se resolverán por hito

- **Fase 1:** usar enteros de 2 a 20 para ratings; fijar fechas y opcionales; validar identidad local concurrente y reglas de referencias.
- **Fase 3:** validar deseos por formato/edición y compatibilidad entre edición y ejemplar.
- **Fase 4:** concretar consecuencias de eliminar y contrato de identidad en restauración; comprobar snapshots, rollback y evolución del esquema.
- **Fases 5–6:** verificar derechos, licencias, cuotas y migraciones antes de elegir integraciones.

## Control de cambios y progreso

Cambios de alcance se reflejan primero en la issue y el objetivo del hito. Cambios arquitectónicos relevantes se documentan con un ADR de producto. Nuevas funciones fuera del MVP permanecen en backlog futuro hasta solicitar su desarrollo.

Seguir issues terminadas frente a seleccionadas, bloqueos abiertos y evidencia de aceptación. No medir progreso por líneas de código ni usar porcentajes sin una base acordada.

## Plantilla de issue

- Identificador y resultado esperado.
- Alcance incluido y excluido.
- Fase y prioridad.
- Criterios de aceptación.
- Dependencias.
- Evidencia de validación al completar.
