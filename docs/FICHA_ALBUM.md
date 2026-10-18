# Ficha y valoración del álbum

LIB-03 amplía la ficha abierta desde el título de una tarjeta o al usar un álbum existente en el registro manual. Muestra título, artistas acreditados, tipo, año original disponible, escucha y descripción. Los campos ausentes no se rellenan con metadatos inventados.

## Portada

Sin portada guardada, se muestra una representación local de vinilo y «Sin portada registrada». Si existe un enlace HTTPS o una imagen local validada, se carga automáticamente al abrir la ficha. La imagen tiene texto alternativo, tamaño reservado y política de referrer sin referencia de la aplicación. Un fallo de carga vuelve a la representación local y ofrece reintento. También se conserva el enlace directo a la portada.

La búsqueda opcional de catálogo puede proponer una URL representativa de Cover Art Archive al seleccionar una referencia; sólo se guarda si la persona la acepta y luego se muestra automáticamente. Una imagen remota requiere acceso a su proveedor y no se copia al respaldo ni a la caché del service worker. Una portada local JPEG/PNG de hasta 2 MiB se valida por tamaño, firma y decodificación antes de aceptarse, se guarda como `Album.coverImage` y acompaña al respaldo; permite ver la imagen offline. No se distribuyen portadas de usuarios como recursos del repositorio.

## Editar el álbum

«Editar álbum» permite corregir título, créditos de artistas, tipo, año, géneros, países de origen, portada y descripción. Los géneros son etiquetas libres del álbum; el país pertenece al artista. El editor advierte cuando ese artista se comparte con otros álbumes. Cancelar conserva los datos anteriores. Guardar preserva `Album.id`, la entrada personal y sus relaciones; no recalcula valoraciones. Una comprobación del estado esperado impide sobrescribir cambios concurrentes. La [guía de edición](EDICION_CATALOGO.md) detalla identidad, procedencia y recuperación.

## Procedencia y enlaces

Cuando el álbum tiene `catalogReference`, la ficha muestra la referencia Wikidata y su fecha de consulta. Los IDs externos validados permiten enlaces canónicos a MusicBrainz, álbumes de Spotify y videos de YouTube, sin incrustar reproductores. Su ausencia no se sustituye por una URL inventada. Los enlaces «Buscar en…» se identifican como búsquedas y no garantizan coincidencia. El proveedor y la conectividad determinan su disponibilidad; los enlaces se abren con `noopener noreferrer` y sin referrer. Véase [integraciones opcionales](INTEGRACIONES_OPCIONALES.md).

## Guardar y quitar nota

La valoración del álbum es independiente de las pistas. Admite 1–10 en pasos de 0,5; el campo acepta coma o punto decimal y rechaza vacíos, cero, valores fuera del rango y otros pasos. `MusicLibrary.rateAlbum` valida de nuevo y guarda unidades enteras de 2 a 20 dentro de la transacción existente.

«Quitar nota» abre una confirmación que muestra el valor y sus consecuencias. Conservar o Escape cancelan sin escribir y devuelven el foco al botón. Confirmar llama a `removeAlbumRating` con el valor confirmado y retira exclusivamente su registro; si cambió, se conserva la nota vigente y se pide actualizar la biblioteca. Una nota ausente se presenta como «Sin nota», sin usar cero; el botón de quitar queda deshabilitado cuando no hay nota guardada. Escucha, comentarios, catálogo y notas de pistas u otros álbumes se conservan.

Los cambios se anuncian después de confirmar la transacción. La ficha relee un snapshot validado y la biblioteca recibe la nota actualizada, incluidos sus filtros y ordenaciones. Durante la operación se bloquean envíos repetidos y navegación para conservar un resultado claro.

## Errores y teclado

- Una entrada inválida conserva el borrador, asocia el mensaje al campo y devuelve el foco a la nota.
- Un fallo de escritura conserva el estado previo y el borrador para reintentar. No se muestran excepciones internas.
- Si la escritura se confirmó pero falla la lectura posterior, se muestra el valor confirmado y una explicación. «Reintentar lectura» no vuelve a guardar ni a quitar la nota. Las escrituras y la navegación esperan a recuperar una lectura coherente.
- Tras guardar, quitar o recuperar la lectura, el foco vuelve al campo. Al volver a biblioteca se conserva la vista y los filtros y se enfoca la tarjeta; si la nota nueva la deja fuera de los filtros, se enfoca la búsqueda.

Los mensajes usan `status` o `alert` y los controles son nativos con foco visible. Cambiar de tarea o de álbum con un borrador ofrece Guardar y salir, Descartar cambios o Seguir editando; no se pierde por navegar sin resolver esa decisión. Los borradores no sobreviven a una recarga confirmada. Las otras pestañas se consultan al actualizar o recargar, sin suscripción automática. La [guía de navegación](NAVEGACION.md) detalla historial, contexto y protección de salida.

## Verificación y límites

Las pruebas de interfaz recorren el adaptador IndexedDB con datos ficticios: metadatos, portada opcional, notas de medio punto, remoción, referencias independientes, reapertura, validación, quota y abortos, reintentos de lectura posteriores al commit, envíos repetidos, borradores por álbum y retorno a una biblioteca filtrada. El parser de decimales y los estados de portada se comprueban por separado.

La comprobación manual usa una base independiente del producto y IndexedDB real: guardado por teclado, nota inválida, reemplazo con quota inyectada y rollback, reintento, lectura fallida después de guardar, remoción real y retorno con filtros. La ficha se comprueba a 320 píxeles; la portada ficticia se verifica desde un recurso público del propio repositorio.

LIB-04 añade el editor de [escucha y notas personales](EXPERIENCIA_PERSONAL.md), con guardado conjunto y protección de borradores ante otras conexiones. COL-01 reúne las [listas originales y ediciones](LISTAS_EDICIONES.md) con pistas compartidas, variantes y orden independiente. COL-02 permite [calificar pistas](CALIFICACIONES_PISTAS.md): la nota se comparte por identidad entre apariciones y cada variante tiene nota independiente. Todos los editores comparten el bloqueo de operaciones pendientes. COL-03 añade [ejemplares físicos y compras digitales](EJEMPLARES.md), con confirmación para eliminar cada copia y migración aditiva del esquema v1 a v2. No necesita dependencias nuevas. COL-04 añade [deseos por formato o edición](DESEOS_COMPRA.md), con cumplimiento explícito y migración aditiva a v3. Respaldo y PWA pertenecen a Fase 4.

Referencias: [calificaciones del dominio](DOMINIO_BIBLIOTECA.md), [casos de uso](CASOS_DE_USO.md), [imágenes HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img) y [estado por identidad en React](https://react.dev/learn/preserving-and-resetting-state).

La [retirada reversible](ELIMINACIONES_PERSONALES.md) permite quitar el álbum sin perder datos y restaurar la misma entrada desde «Álbumes retirados». La confirmación comprueba que sus datos personales no hayan cambiado.
