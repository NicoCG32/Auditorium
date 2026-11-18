# Artistas, ediciones, pistas y portadas

Ampliación **sin publicar** posterior a 1.1.0. La consulta externa necesita el [servicio MusicBrainz](DISCOGRAFIAS.md#transporte-y-configuración). La biblioteca y el registro manual siguen disponibles sin él.

## Abrir un artista

Pulsa el nombre del artista en una tarjeta o en la ficha de un álbum. Su página reúne los álbumes activos de tu biblioteca, las copias registradas y los deseos pendientes. Los créditos se agrupan por identidad local, no por nombre: dos bandas homónimas tienen páginas distintas.

**Consultar discografía** pide los resultados a MusicBrainz y permite compararlos con la biblioteca. Puedes abrir una obra ya incorporada o seleccionar otras y revisar su importación. La comparación permanece abierta después de guardar; al abrir un álbum, su botón de regreso vuelve al artista.

Si el artista se registró manualmente, busca primero su identidad en MusicBrainz. Revisa país y descripción y confirma el vínculo. Se conservan su nombre local, UUID, créditos y datos. Buscar o cancelar no guarda nada.

## Completar un álbum

1. Abre **Pistas y ediciones → Buscar ediciones, pistas o portada (opcional)**.
2. Pulsa **Buscar ediciones y pistas**. Las páginas muestran fecha disponible, país, formatos, sello, número de catálogo y cantidad de pistas. Una obra puede tener muchas ediciones.
3. Revisa una edición. Puedes crear una nueva o vincular una manual del mismo álbum. Un código de barras, número de catálogo o nombre coincidente sólo es una sugerencia; debes elegir qué hacer.
4. Revisa el formato. Los medios mixtos se proponen como **Otro**; no se deduce que tengas esa edición.
5. Deja marcada **Incluir la lista de pistas** si la necesitas. Si tu edición local ya tiene una lista, se conserva. Las listas incompletas, con pregap o datos que requieren interpretación se dejan para el registro manual.
6. **Reutilizar pistas que ya tienes** permite vincular explícitamente una pista manual de título coincidente. Un título igual no demuestra que sea la misma grabación. Una referencia de grabación ya vinculada se reutiliza dentro del mismo álbum.
7. Pulsa **Revisar datos para guardar** y confirma. Hasta entonces no se añade ni cambia ningún registro.

La lista original, las demás ediciones, las notas de pistas, las copias, los deseos, los enlaces y el audio se conservan. Importar una edición no registra una compra. Las posiciones de cada disco se mantienen; las listas de edición pueden compartir pistas sin duplicar sus valoraciones.

Una edición ya guardada se reconoce por su referencia y no se vuelve a añadir. Esta ampliación no actualiza automáticamente metadatos o listas que hayas revisado antes. Puedes seguir editándolos manualmente.

## Elegir una portada

**Ver portada del álbum** consulta Cover Art Archive para la obra; dentro de una edición puedes usar **Ver portada de esta edición**. La vista previa se carga sólo al pedirla y puede acudir a Internet Archive. No se interpreta un fallo de imagen como ausencia de la edición.

La portada actual se conserva por defecto. Para cambiarla, elige la sustitución y confirma el resumen. Se guarda únicamente un enlace HTTPS fijo al catálogo; no se descarga ni incorpora el archivo a la biblioteca. Los respaldos y la sincronización conservan ese enlace. Las imágenes siguen sujetas a los derechos de sus titulares y requieren red para volver a cargarse.

## Persistencia y recuperación

**DB13/nativa130 y JSON/snapshot9** añaden referencias opcionales `musicBrainz: { id, retrievedAt }` en ediciones y pistas. Cada edición tiene una referencia única; una grabación es única por álbum local y puede aparecer en otros álbumes. Los MBIDs no sustituyen UUID locales.

DB12 y todos los documentos de su checkpoint se validan con el contrato anterior antes de actualizar. Los respaldos JSON1–8 conservan lectores estrictos: una edición o pista con referencia MusicBrainz requiere versión9. ZIP1 mantiene su formato y contiene el JSON actual. Un cliente antiguo no debe abrir ni sincronizar una biblioteca de versión posterior.

La confirmación compara el snapshot revisado dentro de una transacción. Si la biblioteca cambió en otra ventana, hay que revisar de nuevo. Si falla la escritura, se revierte todo. Si los datos se guardaron pero falla actualizar la vista, el botón de reintento repite **sólo la lectura** y mantiene protegida la salida.

## Límites y publicación

- El catálogo puede estar incompleto. No se prometen todas las ediciones ni sus portadas.
- La consulta comparte cola y caché con las discografías. Máximo 100 ediciones por página, respuesta de 2 MiB y 1000 pistas por edición; los resultados que exceden el contrato se rechazan para conservar la biblioteca.
- Antes de habilitar la sincronización de esta versión, aplica las migraciones en orden, incluida `20261116231510_edition_recording_references_v9.sql`, y ejecuta `supabase/tests/edition_recording_references.sql`. La migración está preparada en el repositorio; modificar una cuenta remota es una operación de publicación aparte.
- Las pruebas automatizadas usan datos ficticios y perfiles aislados. No sustituyen la comprobación del servicio HTTPS y del entorno Supabase que se vaya a publicar.

Fuentes: [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [ediciones](https://musicbrainz.org/doc/Release), [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive) y [licencias de datos](https://musicbrainz.org/doc/About/Data_License).
