# Registro manual de álbumes

LIB-02 permite añadir álbumes desde la biblioteca, incluido su estado vacío. Artista y título son los únicos datos obligatorios. La clasificación empieza sin especificar, con categorías vacías y publicación desconocida; año original, géneros, país de origen del artista, portada y descripción son opcionales. La portada admite un enlace HTTPS o un archivo JPEG/PNG local de hasta 2 MiB; la vista previa se carga automáticamente. Los campos opcionales vacíos se omiten, sin inventar metadatos.

El formulario permite uno o varios artistas principales. Si hay artistas con el mismo nombre normalizado, ofrece reutilizar un registro por referencia explícita o crear uno nuevo. La selección muestra sus álbumes conocidos para ayudar a distinguir homónimos. No se fusionan artistas por nombre. La elección de un artista existente o un homónimo nuevo es explícita y no tiene selección predeterminada. «Añadir otro artista» permite preparar créditos separados; una referencia externa también puede proponerlos. Los detalles secundarios se despliegan bajo demanda; «Continuar con el registro manual» enfoca la revisión y el guardado.

La [clasificación musical](CLASIFICACION_ALBUM.md) separa tipo, categorías y publicación y documenta la migración histórica.

## Posibles duplicados

Los nombres de álbumes, artistas y alias acreditados, y las etiquetas de género, se guardan con mayúscula inicial por palabra: `System Of A Down` y `Metal Progresivo`. Se compactan espacios y se conservan acentos y signos. Se mantienen siglas reconocibles como `AC/DC`, `R.E.M.` y `U2`, numerales romanos habituales y una lista explícita de siglas musicales. La convención se aplica tanto al alta manual como al catálogo seleccionado y al alta directa; no pretende certificar la grafía oficial de una obra. Las palabras sin una excepción se capitalizan aunque el proveedor use otra estilización.

La regla sólo actúa al escribir nombres: consultar o importar un respaldo conserva el texto histórico. Reutilizar un artista por ID uniforma su nombre manteniendo esa identidad. Descripciones, comentarios, países y enlaces no se capitalizan. Las coincidencias y la selección explícita de homónimos siguen las reglas siguientes; uniformar la escritura no fusiona registros.

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

Tras un alta se releen los datos y se abre la ficha del álbum. La búsqueda, filtros y vista anteriores de Biblioteca se conservan para regresar; no se limpian para forzar la coincidencia de la entrada nueva. Si la lectura falla después del commit, el formulario muestra el recibo, bloquea otra escritura y permite reintentar únicamente la lectura. Cancelar o navegar con cambios pide guardar, descartar o seguir editando, según la [política de navegación y borradores](NAVEGACION.md).

Los títulos de las tarjetas abren la [ficha del álbum](FICHA_ALBUM.md): artista, tipo, año, escucha, valoración y descripción. La portada registrada se carga automáticamente; sin imagen o al fallar se conserva una representación local. La ficha permite [editar los metadatos guardados](EDICION_CATALOGO.md) conservando el ID del álbum y sus relaciones. Al volver a biblioteca se enfoca la tarjeta correspondiente o la búsqueda cuando los filtros la oculten. LIB-03 añade el editor de valoración del álbum.

El formulario enfoca Artista al abrir; la validación enfoca un campo inválido y abre sus detalles si estaban plegados. Los errores se asocian mediante `aria-describedby`, manteniendo etiquetas estables. El aviso de coincidencias recibe foco para continuar por teclado. Cancelar vuelve al botón de alta sin escribir música. Las entradas del formulario no se conservan después de cancelarlo o recargar.

## Verificación y límites

Pruebas con datos ficticios comprueban alta mínima, opcionales, validación, artistas por referencia, revisión sin escrituras, homónimos, concurrencia y coincidencias nuevas entre revisión y confirmación. Las pruebas de interfaz usan el adaptador IndexedDB simulado para actualización automática, ficha existente, catálogo, errores, reintento, envíos repetidos y fallo de lectura posterior al guardado.

La comprobación manual recorre el componente con IndexedDB real en una base independiente: alta, duplicado, reutilización de artista, año inválido, cuota inyectada y rollback, reintento, nueva obra deliberada, incorporación desde catálogo y persistencia tras recarga. Formulario y ficha comprobados a 320 píxeles. No se agotó realmente el almacenamiento del navegador.

LIB-02 se implementó inicialmente sobre v1. El incremento vigente usa DB9 y respaldo6 y conserva este flujo manual junto con las capacidades posteriores de colección y PWA. CAT-01 añade una [búsqueda opcional de referencias](INTEGRACIONES_OPCIONALES.md) mediante botón: seleccionar prepara un borrador editable con procedencia, no guarda ni fusiona por sí mismo. Cambiar título o artista descarta la asociación externa. Errores, ausencia de coincidencia o falta de red no impiden guardar manualmente. Las preferencias de consulta siguen limitadas al montaje y los cambios entre pestañas se consultan al actualizar o recargar.

Referencias: [casos de uso transaccionales](CASOS_DE_USO.md), [consulta de biblioteca](CONSULTA_BIBLIOTECA.md) y [formularios en React](https://react.dev/reference/react-dom/components/form).
