# ADR-010 — Navegación por tareas y experiencia personal separada

Estado: propuesta para UX-03; pendiente de revisión e implementación por tareas.
Fecha: 2026-10-18.
Referencias: [UX-03 #61](https://github.com/NicoCG32/Auditorium/issues/61), [experiencia propuesta](../EXPERIENCIA_USUARIO.md), [contratos](../CONTRATOS_EXPERIENCIA.md).

## Contexto

La aplicación distingue álbum, edición, calificación y ejemplar en el dominio, pero presenta muchos módulos juntos en la ficha y mantiene una cabecera global al cambiar de tarea. El alta, la experiencia y el inventario necesitan una continuidad reconocible. Los enlaces manuales elegidos por el usuario todavía no tienen un contrato personal. La revisión de UX exige además proteger borradores y conservar el contexto al volver.

## Decisión propuesta

1. Organizar el menú en Biblioteca, Añadir álbum, Calificaciones y Mi colección. Biblioteca es el inicio y el inventario de adquisiciones el último destino, con Físico y Digital adquirido diferenciados. Utilidades y deseos conservan acceso secundario; las compras digitales anteriores forman parte de Mi colección.
2. Navegar por fragmentos compatibles con raíz y Pages, con rutas de entrada personal, títulos/contexto propios, historial y origen de regreso. No imponer un router adicional para definir esta arquitectura.
3. Mantener borradores en un registro de la pestaña independiente del montaje de cada pantalla. Aplicar una política común para guardar y salir, descartar explícitamente o seguir editando; distinguir escritura de lectura posterior al commit. No prometer recuperación tras cerrar o recargar sin otro contrato.
4. Separar consulta de edición. Alta identifica y luego revisa datos; guardar abre la ficha. Datos y enlaces se editan en un ámbito coordinado; escucha, nota y comentario se agrupan en Mi experiencia con su propia escritura atómica. Las pistas y copias conservan ámbitos separados.
5. Vincular enlaces manuales y favorito de reproducción a `UserAlbum`, no al álbum abstracto. Conservar `catalogReference` como procedencia externa y exigir elección para incorporar una sugerencia como enlace personal. Enlazar, reproducir, adjuntar, calificar y poseer siguen siendo hechos independientes.
6. Definir el audio como adjunto personal, opcionalmente asociado a una pista del mismo álbum. Su soporte, persistencia, límites y respaldo requieren AUDIO-01; reproducción y metadatos desde proveedor requieren MEDIA-01. El núcleo manual y los enlaces externos no esperan esos resultados.
7. Conservar datos e identidad existentes. Mi colección presenta `OwnedItem.medium=physical` y `purchased_digital` con recuentos/filtros separados, sin reclasificarlos. Deseos no son adquisiciones. Versionar contratos ejecutables únicamente al implementar nuevos datos, manteniendo lectores históricos estrictos.
8. Separar en el álbum tipo principal, categorías combinables y estado de publicación. Inédito no excluye Demo, Split o EP. Conservar Deluxe/Especial/Aniversario en la edición física o digital (`Release`) y los datos de posesión en el ejemplar (`OwnedItem`). UX-05 versiona la separación del enum mixto actual sin inventar clasificaciones; COL-05 reutiliza ediciones sin convertirlas en propiedad implícita.
9. Presentar una sola entrada y una sola nota personal por álbum conceptual. Añadir a esa nota una edición de referencia opcional, elegida con un selector simple entre las ediciones registradas del mismo álbum, sin exigir posesión. UX-06 versiona esta referencia; no crea notas por edición, promedios ni duplicados de biblioteca y no infiere una selección para notas anteriores.

## Alternativas consideradas

| Alternativa                                               | Evaluación                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reordenar sólo colores y espacios de la ficha actual      | No resuelve ámbitos de guardado, navegación ni pérdida de contexto                          |
| Poner enlaces y calificación directamente en `Album`      | Mezcla preferencias/opinión personales con identidad musical                                |
| Usar rutas de servidor sin fallback específico            | Necesita otra solución para aperturas directas en Pages; el fragmento evita esa dependencia |
| Convertir todo el alta en un único formulario extenso     | Vuelve a presentar opciones secundarias antes de completar la intención mínima              |
| Persistir automáticamente todos los borradores y binarios | Introduce contratos de cuota, recuperación y privacidad aún no definidos                    |
| Eliminar medios digitales para simplificar el inventario  | Destruye datos válidos y confunde una proyección física con una migración del dominio       |

## Consecuencias y límites

El diseño permite revisar pantallas y responsabilidades antes de cambiar runtime. UX-04 implementa las guardas e historial; VIS-02 compone la biblioteca; LINK-01 versiona enlaces; UX-05/06 reorganizan alta y experiencia; COL-05 presenta el inventario; UX-07 valida recorridos y comprensión. Los bocetos son herramientas de revisión, sin acceso al repositorio de datos del usuario.

Esta decisión no modifica schemas, IndexedDB, respaldos, recomendaciones ni el código publicado. Tampoco asegura disponibilidad de proveedores, almacenamiento de audio, sincronización o aceptación de uso con participantes. La implementación de cada tarea debe mostrar su evidencia y respetar [la definición de terminado](../PLAN_DESARROLLO.md#definición-de-terminado).
