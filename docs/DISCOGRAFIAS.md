# Incorporar una discografía

Incremento **sin publicar** posterior a 1.1.0. La búsqueda está disponible cuando la instalación tiene configurado el servicio de catálogo; el registro manual y la importación JSON siguen disponibles.

## Buscar y seleccionar

1. Abre **Añadir álbum → Buscar discografía** y escribe una banda o artista.
2. Revisa nombre, país y descripción antes de abrir su discografía. Los homónimos son artistas distintos.
3. Elige un filtro: álbumes de estudio, todas las obras, EP, singles, directos o recopilaciones. «Estudio» muestra grupos de tipo Album sin categorías secundarias; depende de la clasificación de la fuente.
4. Usa **Cargar más obras** para consultar otras páginas. Los contadores distinguen referencias cargadas, obras del filtro y selección; no se promete una discografía exhaustiva. Se muestran las obras con el artista en sus créditos, sin convertir apariciones de pistas en créditos de álbum.
5. Selecciona hasta 500 obras por operación. **Seleccionar visibles** incorpora los resultados cargados del filtro; cambiar de filtro conserva la selección.
6. Revisa coincidencias con tu catálogo. Puedes vincular un artista existente o declarar un homónimo. Para un álbum coincidente, puedes vincularlo, omitirlo o incorporarlo como obra distinta. Los nombres son sugerencias y nunca demuestran identidad por sí solos.
7. Pulsa **Revisar importación** y confirma el resumen. Buscar, paginar, seleccionar o cancelar no escriben datos.

Las obras ya vinculadas se identifican mediante su referencia externa y no se vuelven a importar. Vincular una obra manual conserva sus metadatos, UUID, notas, valoraciones y ediciones; también conserva una retirada previa. Las obras nuevas quedan con escucha **Sin registrar**, sin notas, valoraciones, compras ni deseos inferidos.

La importación de obras incorpora artistas, créditos, título, año disponible, clasificación y procedencia. La [pantalla de artista y la selección de ediciones](ARTISTAS_Y_EDICIONES.md) permiten comparar la colección y completar pistas o portadas opcionalmente desde la ficha; no se descarga ni incorpora música. Los enlaces de origen se encuentran en **Datos del álbum → Referencias del catálogo**.

## Conservación y recuperación

DB13/nativa130 guarda `musicBrainz: { id, retrievedAt }` en artistas, álbumes, ediciones y pistas. Estos MBIDs son referencias externas: no sustituyen UUID locales. Artistas, obras y ediciones tienen referencias únicas; las grabaciones son únicas por álbum. JSON9 y la sincronización nueva conservan los vínculos; los respaldos JSON1–8 se validan con sus contratos históricos antes de migrar. DB12/JSON8 conserva su contrato de referencias sólo para artista y obra. ZIP1 mantiene su formato e incluye el JSON actual.

Editar metadatos conserva el vínculo de la obra. Cambiar su título o identidad de créditos lo desvincula, igual que la referencia Wikidata, para evitar mantener una identidad externa incorrecta. Las pistas, notas y ejemplares mantienen sus identidades locales.

La confirmación relee y compara la biblioteca revisada dentro de una transacción. Un cambio concurrente obliga a revisar de nuevo; un fallo de cuota revierte el lote completo. Si la escritura terminó pero falla la lectura de la vista, **Reintentar lectura tras importación** sólo vuelve a leer. La navegación permanece protegida mientras falta esa lectura.

## Transporte y configuración

La PWA consulta un servicio acotado de Auditorium que envía nombre o MBID a MusicBrainz. Ese intermediario y MusicBrainz reciben las consultas; no reciben la biblioteca, identidad local, notas, valoraciones, compras o audio. La caché temporal contiene sólo respuestas de catálogo, sin persistir búsquedas en la biblioteca.

MusicBrainz exige identificación de la aplicación y limita el tráfico, generalmente a una petición por segundo por IP. El navegador no permite garantizar el User-Agent necesario en todos los motores. Por eso el servicio controla el encabezado, una cola compartida por proceso, timeout, tamaño de respuesta y caché. Acepta exclusivamente búsqueda de artistas, listados paginados de grupos o ediciones y consulta de una edición por MBID; nunca una URL de destino arbitraria.

En desarrollo, `npm run dev` incluye `/api/musicbrainz` sin claves adicionales. Para una instalación estática:

1. Ejecuta `npm run catalog:serve` en un host con Node compatible. Configura `CATALOG_HOST`, `CATALOG_PORT` y `CATALOG_ALLOWED_ORIGINS` según `.env.example`; el valor por defecto escucha sólo en loopback.
2. Publica el servicio detrás de HTTPS y configura `VITE_MUSICBRAINZ_PROXY_URL=https://tu-servicio/api/musicbrainz` al compilar la PWA. En el workflow de Pages corresponde a la variable de repositorio `MUSICBRAINZ_PROXY_URL`.
3. Usa **un único proceso** para cada IP de salida. Varias réplicas requieren una cola y caché coordinadas entre ellas; aumentar réplicas no aumenta el límite del proveedor. Si comparte IP con otros servicios, deben coordinar el tráfico agregado.
4. Antes de publicar una variante con cuenta, aplica las migraciones en orden, incluidas `20261115222457_musicbrainz_references_v8.sql` y `20261116231510_edition_recording_references_v9.sql`. No son necesarias para el funcionamiento local sin cuenta. Verifica los tests SQL `musicbrainz_references.sql` y `edition_recording_references.sql`, además de la batería de sincronización, antes de habilitar usuarios.

La caché guarda hasta 128 respuestas durante seis horas. Hay un máximo de 32 solicitudes pendientes; la cola y errores 503 no se interpretan como ausencia de discos. La actualización de la discografía depende de una consulta del usuario, sin sondeo periódico.

## Verificación

`npm run check` incluye pruebas del cliente, importador, migración, interfaz y servicio de consulta. `npm run test:e2e` añade recorridos con respuestas ficticias, selección entre páginas, reimportación, navegación protegida, móvil y accesibilidad. El test SQL usa datos ficticios y rollback. La disponibilidad de MusicBrainz y la infraestructura de producción requieren una comprobación real separada.

Fuentes: [API MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API), [límites e identificación](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [grupos y ediciones](https://musicbrainz.org/doc/Release_Group), [licencias](https://musicbrainz.org/doc/About/Data_License).
