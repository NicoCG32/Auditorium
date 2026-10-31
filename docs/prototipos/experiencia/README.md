# Bocetos navegables de UX-03

Estado: propuesta visual de la [experiencia](../../EXPERIENCIA_USUARIO.md), pendiente de revisión. **No es la aplicación publicada ni guarda cambios.** Todos los álbumes y artistas son ficticios; las portadas son composiciones CSS originales. Sólo se reutilizan los wordmarks propios del producto.

El refinamiento posterior conserva una sola entrada/nota por álbum, añade el selector opcional Edición de referencia y cambia el destino a Mi colección (Físico / Digital adquirido). Se documenta en [experiencia](../../EXPERIENCIA_USUARIO.md) y [contratos](../../CONTRATOS_EXPERIENCIA.md); el HTML todavía conserva la composición anterior.

## Abrir y revisar

Abrir [index.html](index.html) en un navegador. También puede servirse el repositorio con un servidor estático local y abrir `docs/prototipos/experiencia/index.html`; las imágenes se resuelven respecto a `public/auditorium/brand/`. El HTML no es una vista de GitHub Pages desplegada por el build de la aplicación y no se añade a su PWA ni a la precaché.

El menú y los enlaces cambian de vista; el selector superior alterna temas. Biblioteca admite búsqueda, género, país, escucha, nota y ordenación independientes. Calificaciones permite filtrar por nota y localizar álbumes. Colección permite filtrar las dos copias físicas ficticias. Los botones de formularios muestran la continuación del recorrido; servicios, inventario y guardados son ilustrativos y se identifican como tales.

| Vista            | Fragmento del boceto | Revisar                                                                 |
| ---------------- | -------------------- | ----------------------------------------------------------------------- |
| Biblioteca       | `#biblioteca`        | Música visible primero, búsqueda y filtros bajo demanda                 |
| Identificar      | `#anadir`            | Dos datos iniciales y una alternativa manual clara                      |
| Revisar alta     | `#revision`          | Datos opcionales, enlaces por propósito y guardado final                |
| Editar datos     | `#editar`            | Alcance distinto de experiencia e inventario                            |
| Ficha            | `#album`             | Consulta, Escuchar/Comprar y acceso a cada tarea                        |
| Calificaciones   | `#calificaciones`    | Por calificar, calificados y recalificación                             |
| Mi experiencia   | `#experiencia`       | Nota, escucha y comentario con un solo ámbito                           |
| Colección física | `#coleccion`         | Inventario aparte, copias diferenciadas y acceso a registros anteriores |

Probar a 360 × 800 y 1280 × 900, en oscuro y claro; revisar también 320 px, teclado, zoom y filtros abiertos. Las rutas simplificadas de estos bocetos no son la especificación de rutas de producción: esa propuesta usa entradas personales y se describe en [Experiencia de usuario](../../EXPERIENCIA_USUARIO.md#3-rutas-historial-y-regreso).

## Límites

El JavaScript sólo compone vistas y datos ficticios en memoria. No importa módulos de la aplicación, no abre IndexedDB/localStorage, no solicita claves, no reproduce ni descarga audio y no realiza consultas a terceros. Recargar restablece la muestra. La navegación visual no implementa guardas, transacciones, errores de almacenamiento, concurrencia ni restauración de contexto de producción; el diálogo de cambios pendientes ilustra las opciones, no las garantiza.

Revisar y Editar muestran, bajo demanda, tipo principal, categorías múltiples y publicación por separado. Los controles ilustran el contrato propuesto; guardar no persiste ni aplica esa clasificación a la ficha de muestra. Deluxe/Especial/Aniversario describen ediciones físicas o digitales, y el inventario distingue la edición del ejemplar poseído.

La opinión de un álbum de muestra se presenta como contenido ilustrativo. Los datos incluyen un álbum escuchado sin nota y otro pendiente con nota para mostrar que esas dimensiones son independientes. La revisión con participantes y las pruebas del código real corresponden a las tareas de implementación y UX-07.
