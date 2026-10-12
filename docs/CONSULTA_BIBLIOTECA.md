# Consultar la biblioteca local

LIB-01 conecta la pantalla principal con el repositorio IndexedDB. Al abrirla se lee un snapshot validado de catálogo y biblioteca y se muestran solo las entradas personales activas. Álbumes del catálogo sin entrada personal e históricos dados de baja no aparecen en los resultados.

## Búsqueda y filtros

- Buscar por título y por todos los artistas acreditados, tanto sus nombres como los alias del crédito. La búsqueda ignora mayúsculas y acentos; cada palabra debe estar presente, aunque su orden sea distinto.
- Escucha: todos, sin registrar, pendiente, escuchando o escuchado.
- Nota: todas, sin nota, con nota o 8 y más. Solo cuenta la calificación del álbum; no se calcula desde las pistas. Una nota ausente permanece ausente.
- Orden: añadidos recientemente, título A–Z, artista A–Z o mayor nota. Las entradas sin nota quedan al final al ordenar por nota. Título e ID dan un desempate estable.
- Cuadrícula y lista presentan los mismos resultados. Cambiar la vista conserva búsqueda, filtros y orden.

Los créditos se presentan en su orden explícito. La búsqueda, los filtros y las ordenaciones se calculan sobre una proyección de lectura, sin alterar los datos guardados. No se solicitan carátulas ni recursos externos: la representación de vinilo es decorativa y local.

## Carga, actualización y errores

La lectura comienza al montar la aplicación. «Actualizar biblioteca» vuelve a consultar los cambios guardados y conserva los criterios de búsqueda. Las respuestas de cargas anteriores se descartan al cancelar su efecto; la conexión se mantiene durante la vida de la aplicación y se cierra al reemplazar el módulo durante desarrollo.

La biblioteca vacía explica dónde aparecerán los álbumes y permite consultar cambios guardados. La búsqueda sin resultados ofrece «Mostrar todos los álbumes», que limpia sus criterios. Los errores presentan un mensaje comprensible y una acción para reintentar, sin exponer excepciones ni datos personales.

Esta entrega es de consulta. El formulario manual y la acción de agregar el primer álbum corresponden a LIB-02; la ficha y edición a LIB-03. Los filtros de propiedad/formato llegarán cuando existan ejemplares. No se muestran controles de esas funciones mientras estén pendientes.

Las preferencias de búsqueda y vista duran mientras la pantalla permanezca montada. No hay suscripción automática a cambios entre pestañas; actualizar o recargar lee el estado vigente. La apertura puede crear la identidad de una base nueva, pero las consultas no escriben registros musicales.

## Accesibilidad y verificación

La pantalla conserva el enlace para saltar al contenido, foco visible, etiquetas de controles nativos, botones de vista con estado `aria-pressed`, anuncios de carga/conteo y alerta de error. Las portadas decorativas no se leen. Las vistas se adaptan a móvil, tablet y escritorio, con títulos largos que pueden partirse sin perder contenido.

Las pruebas verifican la proyección, búsqueda por varios créditos, notas ausentes, umbral inclusivo de 8, combinación de filtros y órdenes estables. Las pruebas de interfaz usan el adaptador sobre IndexedDB simulado: estado vacío, actualización, filtros, reapertura, reintento y cancelación de respuestas tardías. La comprobación manual recorre el mismo componente con IndexedDB del navegador, datos ficticios y una base independiente del producto.

Referencias: [persistencia local](PERSISTENCIA_LOCAL.md), [efectos y limpieza en React](https://react.dev/reference/react/useEffect) y [plan de desarrollo](PLAN_DESARROLLO.md).
