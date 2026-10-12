# Registro manual de álbumes

LIB-02 permite añadir álbumes desde la biblioteca, incluido su estado vacío. Artista y título son los únicos datos obligatorios. El tipo empieza como «Álbum» y se puede cambiar; año original, enlace HTTPS a portada y descripción son opcionales. Los campos opcionales vacíos se omiten, sin inventar metadatos.

El formulario registra un artista principal. Si hay artistas con el mismo nombre normalizado, ofrece reutilizar un registro por referencia explícita o crear uno nuevo. La selección muestra sus álbumes conocidos para ayudar a distinguir homónimos. No se fusionan artistas por nombre. Créditos múltiples siguen admitidos por el modelo y los casos de uso, aunque esta primera interfaz registre uno.

## Posibles duplicados

`MusicLibrary.registerAlbum` valida la entrada y busca coincidencias dentro de la transacción de escritura antes de crear música. Se considera posible coincidencia el mismo título normalizado y un artista del crédito coincidente. Para un artista elegido por referencia se compara su ID; para un nombre nuevo se comparan el nombre y el alias acreditado. La normalización ignora mayúsculas, acentos y espacios repetidos. No se aplica búsqueda aproximada ni se interpreta una coincidencia como identidad confirmada.

La revisión ofrece:

- **Abrir álbum existente:** conserva la relación activa y sus datos personales y abre su ficha básica.
- **Añadir álbum del catálogo:** crea la relación personal si falta, conservando el álbum y sus artistas. También permite conservar históricos y crear una nueva relación activa.
- **Crear otro álbum:** decisión explícita que conserva los registros anteriores; un artista nuevo con el mismo nombre recibe otro ID salvo elección por referencia.

Año y tipo se muestran para revisar, pero no excluyen una coincidencia por título/artista. Una edición diferente tampoco se crea desde este formulario: la gestión de ediciones pertenece a su propio hito.

La confirmación indica los IDs de candidatos revisados. Si otra conexión añade una coincidencia distinta antes de guardar, se devuelve una nueva revisión sin crear registros musicales. Dos solicitudes concurrentes equivalentes sin confirmación producen un alta y una revisión. Cambiar campos o la selección de artista descarta la revisión anterior.

El caso `createAlbum` existente conserva su contrato de alta directa para los otros flujos. El formulario usa `registerAlbum`, que siempre incorpora la nueva obra a la biblioteca.

## Guardado, errores y navegación

Artista, álbum, crédito y relación personal se guardan juntos. La interfaz bloquea controles y envíos repetidos durante la operación y solo anuncia éxito después de confirmar la transacción. Los fallos conservan el formulario para reintentar; no muestran excepciones internas.

Tras un alta, se relee la biblioteca automáticamente, se limpian búsqueda y filtros para hacer visible la entrada y se enfoca su título. La vista de lista/cuadrícula se conserva. Si esa lectura falla después de confirmar el guardado, se informa que el álbum se guardó y se permite reintentar únicamente la lectura.

Los títulos de las tarjetas abren la [ficha del álbum](FICHA_ALBUM.md): artista, tipo, año, escucha, valoración y descripción. La portada se carga solo mediante acción del usuario; sin enlace o al fallar se conserva una representación local. Al volver a biblioteca se enfoca la tarjeta correspondiente o la búsqueda cuando los filtros la oculten. LIB-03 añade el editor de valoración del álbum.

El formulario enfoca Artista al abrir; la validación enfoca un campo inválido y abre sus detalles si estaban plegados. Los errores se asocian mediante `aria-describedby`, manteniendo etiquetas estables. El aviso de coincidencias recibe foco para continuar por teclado. Cancelar vuelve al botón de alta sin escribir música. Las entradas del formulario no se conservan después de cancelarlo o recargar.

## Verificación y límites

Pruebas con datos ficticios comprueban alta mínima, opcionales, validación, artistas por referencia, revisión sin escrituras, homónimos, concurrencia y coincidencias nuevas entre revisión y confirmación. Las pruebas de interfaz usan el adaptador IndexedDB simulado para actualización automática, ficha existente, catálogo, errores, reintento, envíos repetidos y fallo de lectura posterior al guardado.

La comprobación manual recorre el componente con IndexedDB real en una base independiente: alta, duplicado, reutilización de artista, año inválido, cuota inyectada y rollback, reintento, nueva obra deliberada, incorporación desde catálogo y persistencia tras recarga. Formulario y ficha comprobados a 320 píxeles. No se agotó realmente el almacenamiento del navegador.

El esquema sigue en v1 y no requiere migración. No se añaden importaciones remotas, ejemplares, respaldo, PWA ni sincronización. Las preferencias de consulta siguen limitadas al montaje y las actualizaciones entre pestañas se consultan al actualizar o recargar.

Referencias: [casos de uso transaccionales](CASOS_DE_USO.md), [consulta de biblioteca](CONSULTA_BIBLIOTECA.md) y [formularios en React](https://react.dev/reference/react-dom/components/form).
