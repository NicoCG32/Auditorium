# Escucha y notas personales

LIB-04 añade a la ficha un editor de experiencia personal. Permite cambiar directamente entre «Sin registrar», «Pendiente», «Escuchando» y «Escuchado» y guardar un comentario, sin depender de la valoración ni de la colección física.

## Guardado e independencia

Estado y comentario se guardan juntos mediante `MusicLibrary.updatePersonalExperience`. El caso valida la entrada y aplica `set_personal_experience` dentro de una transacción. Solo cambia `listeningStatus`, `personalNotes` y `updatedAt` de la entrada personal activa. La identidad, relación con el álbum, fecha de alta, catálogo y calificaciones permanecen intactos.

Un texto no vacío conserva espacios y saltos de línea. Un campo vacío o compuesto solo por espacios se guarda como ausencia de `personalNotes`, sin `null` ni texto de relleno. «Limpiar notas del formulario» vacía el borrador; hace falta guardar para quitar el comentario almacenado. Omitir `personalNotes` en este caso de uso también quita el comentario: representa el guardado completo de estos dos campos, no una actualización parcial.

El estado de escucha no declara propiedad ni crea ejemplares, deseos o ediciones. La entrada estricta del caso de uso no acepta campos de propiedad. Esas entidades se incorporan en Fase 3.

## Borradores y otras conexiones

La interfaz conserva la referencia inicial de la experiencia: estado, comentario y fecha de actualización. El campo opcional `expected` del caso de uso compara esa referencia con el estado vigente dentro de la transacción. Si otra conexión lo cambió, devuelve `outdated_experience` antes de escribir. La comparación del contenido evita perder cambios incluso cuando dos guardados comparten el mismo timestamp.

La valoración puede actualizarse sin renovar la referencia de un borrador personal pendiente. Un cambio de experiencia hecho desde otra pestaña sigue requiriendo revisión, aunque la ficha se haya actualizado al guardar una valoración.

Ante un conflicto, el borrador permanece disponible y guardar queda bloqueado. «Cargar datos guardados» reemplaza el formulario explícitamente con la lectura actual. Si esa lectura falla, el borrador se conserva y se permite reintentar. Los callers que omitan `expected` mantienen el comportamiento de actualización directa; la interfaz siempre envía su referencia.

## Errores, actualización y teclado

Los controles de experiencia, valoración y navegación se bloquean mientras haya una operación de detalle en curso. Los envíos repetidos se ignoran. Si una escritura falla, se conserva el estado guardado y el formulario para reintentar, sin exponer excepciones internas.

Después del commit, se relee el snapshot validado y se actualizan ficha, tarjeta y filtros sin recarga. Si esa lectura falla, la interfaz informa que el cambio se guardó y «Reintentar lectura de experiencia» consulta únicamente los datos: no repite la escritura. La valoración espera a recuperar una lectura coherente.

Los mensajes usan `status` o `alert`; select y textarea tienen etiquetas y foco visible. El reintento recibe foco ante errores de lectura o conflictos y el selector lo recupera al completar. Al volver a biblioteca se conserva la vista y los filtros; una tarjeta que dejó de coincidir devuelve el foco a la búsqueda.

Los borradores se mantienen durante el montaje de la ficha. Cambiar de álbum o recargar los descarta; los valores guardados se recuperan desde IndexedDB. No se incorpora una suscripción automática entre pestañas ni se transmite el comentario a servicios remotos.

## Verificación y salida de fase

Las pruebas con datos ficticios recorren las 16 combinaciones de estados, preservación de texto y calificaciones, omisión de comentarios, validación, referencias inactivas/desactualizadas, rollback y reapertura. Las pruebas de interfaz cubren escritura, limpieza, conflictos, fallo al cargar datos, reintentos posteriores al commit, filtros y exclusión mutua con la valoración.

La comprobación manual usa IndexedDB real en una base aislada: transiciones, texto multilínea conservado tras recarga, cuota inyectada después de retirar la fila previa, reintento, modificación desde otra conexión, borrador protegido, limpieza y error de lectura después de guardar. Catálogo y calificaciones se comparan con la referencia inicial. El editor se comprueba a 320 píxeles y mediante teclado.

El esquema sigue en v1: los campos ya existían y no requieren migración ni dependencias nuevas. LIB-04 es la última tarea de Fase 2; el milestone puede cerrarse tras revisar e integrar su PR y comprobar que no queden issues abiertas. El MVP completo continúa hasta Fase 4, según el [plan](PLAN_DESARROLLO.md).

Referencias: [dominio de biblioteca](DOMINIO_BIBLIOTECA.md), [casos de uso](CASOS_DE_USO.md) y [ficha del álbum](FICHA_ALBUM.md).
