# Consultar la biblioteca local

LIB-01 conecta la pantalla principal con el repositorio IndexedDB. Al abrirla se lee un snapshot validado de catálogo y biblioteca y se muestran solo las entradas personales activas. Álbumes del catálogo sin entrada personal e históricos dados de baja no aparecen en los resultados.

## Búsqueda y filtros

- Buscar por título, géneros, países de origen y por todos los artistas acreditados, tanto sus nombres como los alias del crédito. La búsqueda ignora mayúsculas y acentos; cada palabra debe estar presente, aunque su orden sea distinto.
- Escucha: todos, sin registrar, pendiente, escuchando o escuchado.
- Nota: todas, sin nota, con nota o 8 y más. Solo cuenta la calificación del álbum; no se calcula desde las pistas. Una nota ausente permanece ausente.
- Género y país de origen: seleccionar un valor conocido o todos. Las opciones proceden de la biblioteca activa completa, sin desaparecer por los otros filtros. Los alias de acentos, mayúsculas y espacios se agrupan, conservando una etiqueta legible. Los países corresponden a los artistas acreditados y no al país de fabricación de una edición.
- Orden: añadidos recientemente, título A–Z, artista A–Z, género A–Z, país de origen A–Z o mayor nota. Las etiquetas múltiples se comparan ordenadas; los datos ausentes quedan al final en el orden correspondiente. Título e ID dan un desempate estable.
- Cuadrícula y lista presentan los mismos resultados. Cambiar la vista conserva búsqueda, filtros y orden.

Los créditos se presentan en su orden explícito. La búsqueda, los filtros y las ordenaciones se calculan sobre una proyección de lectura, sin alterar los datos guardados. Las tarjetas cargan automáticamente la portada guardada. Una URL necesita conexión; un JPEG/PNG local se lee de los datos del álbum. Sin imagen o ante un fallo se conserva la representación local. No se consulta un catálogo por el hecho de filtrar u ordenar.

## Carga, actualización y errores

La lectura comienza al montar la aplicación. «Actualizar biblioteca» vuelve a consultar los cambios guardados y conserva los criterios de búsqueda. Las respuestas de cargas anteriores se descartan al cancelar su efecto; la conexión se mantiene durante la vida de la aplicación y se cierra al reemplazar el módulo durante desarrollo.

La biblioteca vacía ofrece «Añadir tu primer álbum», conectado al [registro manual](REGISTRO_MANUAL.md). La búsqueda sin resultados ofrece «Mostrar todos los álbumes», que limpia sus criterios. Los errores presentan un mensaje comprensible y una acción para reintentar, sin exponer excepciones ni datos personales.

LIB-02 incorpora el formulario manual; LIB-03 amplía la [ficha y valoración](FICHA_ALBUM.md), abierta desde el título de una tarjeta o al usar un registro existente. Al registrar un álbum, la biblioteca se actualiza automáticamente y se limpian los criterios para mostrar la entrada nueva. Cambiar una nota actualiza los resultados conservando los filtros. Los filtros de propiedad/formato llegarán cuando existan ejemplares.

LIB-04 permite editar [escucha y notas personales](EXPERIENCIA_PERSONAL.md) desde esa misma ficha. El guardado actualiza la biblioteca conservando sus filtros; si la entrada deja de coincidir, volver enfoca la búsqueda. Los comentarios no se usan para buscar ni para calcular valoraciones.

Las preferencias de búsqueda y vista duran mientras la pantalla permanezca montada. No hay suscripción automática a cambios entre pestañas; actualizar o recargar lee el estado vigente. La apertura puede crear la identidad de una base nueva, pero las consultas no escriben registros musicales.

## Accesibilidad y verificación

La pantalla conserva el enlace para saltar al contenido, foco visible, etiquetas de controles nativos, botones de vista con estado `aria-pressed`, anuncios de carga/conteo y alerta de error. La representación decorativa de vinilo no se lee; una imagen registrada conserva texto alternativo. Las vistas se adaptan a móvil, tablet y escritorio, con títulos largos que pueden partirse sin perder contenido.

Las pruebas verifican la proyección, búsqueda por varios créditos, notas ausentes, umbral inclusivo de 8, combinación de filtros y órdenes estables. Las pruebas de interfaz usan el adaptador sobre IndexedDB simulado: estado vacío, actualización, filtros, reapertura, reintento y cancelación de respuestas tardías. La comprobación manual recorre el mismo componente con IndexedDB del navegador, datos ficticios y una base independiente del producto.

Referencias: [persistencia local](PERSISTENCIA_LOCAL.md), [efectos y limpieza en React](https://react.dev/reference/react/useEffect) y [plan de desarrollo](PLAN_DESARROLLO.md).
