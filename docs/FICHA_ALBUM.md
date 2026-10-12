# Ficha y valoración del álbum

LIB-03 amplía la ficha abierta desde el título de una tarjeta o al usar un álbum existente en el registro manual. Muestra título, artistas acreditados, tipo, año original disponible, escucha y descripción. Los campos ausentes no se rellenan con metadatos inventados.

## Portada

Sin URL guardada, se muestra una representación local de vinilo y «Sin portada registrada». Si existe un enlace HTTPS, «Mostrar portada» permite cargarlo por decisión del usuario. La imagen tiene texto alternativo, tamaño reservado y política de referrer sin referencia de la aplicación. Un fallo de carga vuelve a la representación local y ofrece reintento. También se conserva el enlace directo a la portada.

No se buscan carátulas ni se añaden imágenes ajenas al producto. La figura SVG de prueba es ficticia. Mostrar una imagen remota requiere acceso a su proveedor; no se almacena un respaldo de esa imagen ni se promete disponibilidad offline. La elección de mostrarla dura durante el montaje de la ficha y se conserva al actualizar su nota.

## Guardar y quitar nota

La valoración del álbum es independiente de las pistas. Admite 1–10 en pasos de 0,5; el campo acepta coma o punto decimal y rechaza vacíos, cero, valores fuera del rango y otros pasos. `MusicLibrary.rateAlbum` valida de nuevo y guarda unidades enteras de 2 a 20 dentro de la transacción existente.

«Quitar nota» llama a `removeAlbumRating` y elimina exclusivamente su registro. Una nota ausente se presenta como «Sin nota», sin usar cero; el botón de quitar queda deshabilitado cuando no hay nota guardada. Escucha, comentarios, catálogo y notas de pistas u otros álbumes se conservan.

Los cambios se anuncian después de confirmar la transacción. La ficha relee un snapshot validado y la biblioteca recibe la nota actualizada, incluidos sus filtros y ordenaciones. Durante la operación se bloquean envíos repetidos y navegación para conservar un resultado claro.

## Errores y teclado

- Una entrada inválida conserva el borrador, asocia el mensaje al campo y devuelve el foco a la nota.
- Un fallo de escritura conserva el estado previo y el borrador para reintentar. No se muestran excepciones internas.
- Si la escritura se confirmó pero falla la lectura posterior, se muestra el valor confirmado y una explicación. «Reintentar lectura» no vuelve a guardar ni a quitar la nota. Las escrituras y la navegación esperan a recuperar una lectura coherente.
- Tras guardar, quitar o recuperar la lectura, el foco vuelve al campo. Al volver a biblioteca se conserva la vista y los filtros y se enfoca la tarjeta; si la nota nueva la deja fuera de los filtros, se enfoca la búsqueda.

Los mensajes usan `status` o `alert` y los controles son nativos con foco visible. Cambiar de álbum descarta un borrador sin guardar y carga su propia nota; los borradores no sobreviven a una recarga. Las otras pestañas se consultan al actualizar o recargar, sin suscripción automática.

## Verificación y límites

Las pruebas de interfaz recorren el adaptador IndexedDB con datos ficticios: metadatos, portada opcional, notas de medio punto, remoción, referencias independientes, reapertura, validación, quota y abortos, reintentos de lectura posteriores al commit, envíos repetidos, borradores por álbum y retorno a una biblioteca filtrada. El parser de decimales y los estados de portada se comprueban por separado.

La comprobación manual usa una base independiente del producto y IndexedDB real: guardado por teclado, nota inválida, reemplazo con quota inyectada y rollback, reintento, lectura fallida después de guardar, remoción real y retorno con filtros. La ficha se comprueba a 320 píxeles; la portada ficticia se verifica desde un recurso público del propio repositorio.

LIB-04 añade el editor de [escucha y notas personales](EXPERIENCIA_PERSONAL.md), con guardado conjunto y protección de borradores ante otras conexiones. COL-01 reúne las [listas originales y ediciones](LISTAS_EDICIONES.md) con pistas compartidas, variantes y orden independiente. COL-02 permite [calificar pistas](CALIFICACIONES_PISTAS.md): la nota se comparte por identidad entre apariciones y cada variante tiene nota independiente. Todos los editores comparten el bloqueo de operaciones pendientes. El esquema sigue en v1 y no necesita migración ni dependencias nuevas. Ejemplares y deseos permanecen en sus siguientes hitos; respaldo y PWA pertenecen a Fase 4.

Referencias: [calificaciones del dominio](DOMINIO_BIBLIOTECA.md), [casos de uso](CASOS_DE_USO.md), [imágenes HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img) y [estado por identidad en React](https://react.dev/learn/preserving-and-resetting-state).
