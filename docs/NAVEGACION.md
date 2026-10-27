# Navegación, contexto y borradores

Esta guía describe la implementación de UX-04. Complementa el [diseño del recorrido](EXPERIENCIA_USUARIO.md) y los [contratos propuestos](CONTRATOS_EXPERIENCIA.md); no convierte sus ampliaciones futuras de datos en funciones disponibles.

## Destinos y rutas

El menú principal sigue Biblioteca → Añadir álbum → Calificaciones → Mi colección. Recomendaciones, Respaldos, Álbumes retirados, Deseos de compra y Cuenta y dispositivos se agrupan en navegación secundaria bajo Más opciones. Este menú se despliega a petición y se cierra con Escape, clic fuera o navegación; Escape devuelve el foco a su control de apertura. La [guía de Biblioteca](BIBLIOTECA.md) detalla búsqueda, filtros y tarjetas.

| Fragmento                               | Destino                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `#/biblioteca`                          | Biblioteca, búsqueda, filtros, orden y vista                     |
| `#/anadir`                              | Registro manual y selección opcional de referencia externa       |
| `#/album/{userAlbumId}`                 | Ficha de la entrada personal                                     |
| `#/album/{userAlbumId}/editar`          | Editor de metadatos                                              |
| `#/album/{userAlbumId}/experiencia`     | Entrada a la ficha desde la tarea de valoración                  |
| `#/calificaciones`                      | Índice Por calificar / Calificados, con búsqueda                 |
| `#/coleccion`                           | Índice de adquisiciones y elección de álbum                      |
| `#/coleccion/nueva?album={userAlbumId}` | Acceso contextual a la ficha y sus operaciones de colección      |
| `#/opciones/{seccion}`                  | `recomendaciones`, `respaldos`, `retirados`, `deseos` o `cuenta` |

Las rutas identifican una entrada de esta biblioteca; no comparten datos con otro navegador. Un álbum inexistente o retirado ofrece volver a Biblioteca; una ruta no reconocida muestra una recuperación equivalente. No se borran registros ni se ejecuta una operación por abrir una URL.

El servidor recibe sólo la raíz configurada, `/` o `/Auditorium/`, también con `index.html` y query. La aplicación interpreta el fragmento sin requerir rewrites del alojamiento. Navegar conserva pathname y query. El antiguo `#contenido` abre Biblioteca; el enlace Ir al contenido ahora mueve el foco sin cambiar la ruta.

## Contexto y regreso

Durante la vida de la pestaña se conservan búsqueda, filtros, orden y cuadrícula/lista de Biblioteca, así como búsqueda/sección de Calificaciones y medio de Mi colección. Abrir un álbum recuerda su destino de origen; regresar desde Calificaciones o Mi colección vuelve a ese destino.

Cada pantalla recuerda su posición y foco. El regreso procura enfocar el control de origen sin desplazarlo y recuperar la posición anterior. Si una tarjeta deja de existir en el resultado filtrado, se enfoca la búsqueda. En una transición sin contexto se enfoca el título; la primera apertura de Biblioteca respeta el foco nativo para mantener Ir al contenido como primer destino de Tab. La apertura directa y la recarga pueden recuperar la pantalla por URL, pero no prometen recuperar filtros, scroll o borradores de una sesión terminada.

Guardar un alta o reutilizar una coincidencia abre su ficha después de leer los datos confirmados; la consulta previa de Biblioteca se conserva. El menú Biblioteca permite regresar aunque los filtros actuales no incluyan el álbum nuevo.

## Cambios sin guardar

Los valores y datos esperados de cada editor residen en memoria, identificados por entrada y tarea, separados del snapshot confirmado. No se guardan en localStorage, sessionStorage, URL, historial o respaldo. Esta memoria permite conservar el borrador al desmontar un editor mientras siga vivo su registro; cerrar o recargar la aplicación la elimina.

La navegación y las cancelaciones de editores con cambios pendientes ofrecen un diálogo modal:

| Acción                   | Resultado                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Guardar y salir          | Valida y envía los formularios afectados; continúa sólo si el guardado y su lectura se confirman |
| Descartar cambios        | Elimina únicamente los borradores del ámbito que se abandona; no retira álbumes ni adquisiciones |
| Seguir editando / Escape | Cierra el diálogo, mantiene pantalla y borrador y devuelve el foco al control que lo abrió       |

La protección cubre alta, metadatos, nota de álbum/pista, escucha/comentario, listas/ediciones, ejemplares y deseos. Al cambiar de pista, lista o edición también se resuelve el borrador de valoración que se cerraría. Las acciones expresamente rotuladas Descartar borrador conservan su alcance local. Los formularios sin cambios no requieren confirmación.

Si hay varios editores afectados, Guardar y salir confirma cada operación de forma secuencial. No es una transacción conjunta entre módulos: un error posterior conserva los cambios ya confirmados, mantiene los demás borradores y cancela la salida. Los mensajes de cada editor distinguen guardado, validación y fallo. UX-06 guarda escucha, nota, comentario y edición de referencia mediante una única transacción y comparación concurrente de experiencia; véase [Mi experiencia](MI_EXPERIENCIA.md).

Si Guardar y salir falla, se cierra el diálogo y se devuelve el foco al campo que requiere corrección o al control para recuperar la lectura. El borrador y la pantalla permanecen disponibles.

Retirar un álbum se bloquea mientras haya borradores de sus formularios sin resolver. Una acción de navegación no confirma una retirada, compra o cumplimiento de deseo.

## Historial y recarga

Las navegaciones nuevas añaden una entrada de historial; finalizar un guardado reemplaza la entrada del editor. El historial conserva sólo un identificador de recorrido y su índice, junto a la URL, sin campos del formulario ni claves. Los filtros no crean una entrada por pulsación.

Atrás/Adelante usa la misma protección. Ante cambios pendientes, el controlador recupera primero la posición de origen sin desmontar la pantalla; después permite guardar, descartar o cancelar. Un salto de varias entradas conserva su destino y sólo se reanuda tras resolver el diálogo. El índice del historial propio se reconoce después de recargar, sin recuperar borradores anteriores. Una entrada sin metadatos propios se trata como una ruta externa al recorrido conocido; no se adivina un desplazamiento numérico.

Mientras se restaura el historial o se guarda se bloquean envíos repetidos. Al cerrar o recargar con trabajo pendiente se solicita la advertencia nativa `beforeunload`; su disponibilidad depende del navegador y no garantiza recuperación tras confirmar la salida, especialmente en móvil.

## Guardado confirmado y lectura fallida

Un commit y la lectura posterior son fases distintas. Si la escritura falla se conservan datos anteriores y borrador. Si la escritura se confirma y falla la lectura, el editor muestra el recibo, bloquea otra escritura y la navegación, y ofrece **Reintentar lectura**. Ese botón no vuelve a crear un álbum, edición, deseo o ejemplar ni repite la valoración.

El alta aplica la misma regla: recuerda el identificador confirmado y abre la ficha sólo después de recuperar la lectura. Los conflictos conservan el borrador y requieren revisar el estado guardado con las acciones explícitas del editor.

## Alcance de esta entrega

Calificaciones y Mi colección son índices de navegación sobre los datos existentes. Mi colección distingue **Físico / Digital adquirido** y mantiene sus recuentos separados; los deseos conservan su destino secundario. Consultar o registrar datos sigue utilizando las operaciones actuales en la ficha. No se infiere una compra a partir de un enlace, suscripción o reproducción.

VIS-02 completa la composición de Biblioteca, con filtros plegables, selecciones visibles y apertura desde portada o título. Enlaces personales (LINK-01), alta/edición y clasificación musical (UX-05), experiencia conjunta y selector opcional Edición de referencia (UX-06), notas independientes por género (RATE-01/02) y composición de Mi colección (COL-05) ya tienen implementación. La URL de experiencia abre su editor conjunto; la de colección abre su sección desplegable. Mi colección conserva búsqueda, filtros y selector al regresar, con edición y retirada de copias independientes. La [validación integral](VALIDACION_RECORRIDO.md) distingue regresión técnica y comprensión pendiente. No se altera la independencia entre álbum, edición, calificación y adquisición.

Los refinamientos de navegación y Biblioteca no cambian los esquemas ni el formato de respaldo. Se conservan los lectores históricos y las reglas de [respaldo](RESPALDOS_JSON.md), [experiencia](EXPERIENCIA_PERSONAL.md) y [ejemplares](EJEMPLARES.md). La cuenta opcional y la sincronización se documentan en su [guía independiente](SINCRONIZACION_SUPABASE.md).
