# ADR-009 — Edición de metadatos y portadas automáticas

Estado: aceptada para UX-01; implementación y validación de entrega en curso.
Fecha: 2026-10-17.
Referencia: [UX-01 #59](https://github.com/NicoCG32/Auditorium/issues/59), [guía de edición](../EDICION_CATALOGO.md) y [ADR-008](008-integraciones-opcionales.md).

## Contexto

La revisión del incremento AI-01/CAT-01 requiere corregir metadatos después del alta, organizar la biblioteca por género y país de origen y mostrar la portada sin un segundo botón. Una portada local debe conservarse con la música y estar disponible offline. La biblioteca ya distingue identidad del álbum, artistas compartidos, créditos y experiencia personal.

## Decisión

1. Añadir `MusicLibrary.updateAlbum` como escritura transaccional, con referencia esperada de álbum, créditos y artistas. Conservar el ID del álbum y todas las relaciones musicales y personales. Un conflicto no sobrescribe cambios; una lectura fallida posterior al commit se recupera sin repetir el guardado.
2. Permitir corregir título, créditos, tipo, año, géneros, país, portada y descripción. Cambiar un nombre crea un artista para el crédito de ese álbum y conserva el artista anterior; corregir el país de un artista referenciado actualiza ese dato compartido con advertencia en el editor. No fusionar identidades por nombre.
3. Añadir `Album.genres` opcional con hasta veinte etiquetas libres de ochenta caracteres, y `Artist.country` opcional de hasta cien caracteres. No introducir una taxonomía obligatoria ni mezclar origen del artista con país de edición. Buscar, filtrar y ordenar mediante una proyección local; no añadir consultas remotas para esos metadatos.
4. Cargar automáticamente la portada al introducir su URL válida y al mostrar un álbum guardado. Admitir como fuente alternativa un archivo JPEG/PNG local de hasta 2 MiB, validado por tamaño, MIME, firma y decodificación, con un máximo de 8192 píxeles por eje y 32 millones de píxeles en total. Persistirlo como `Album.coverImage` data URL y rechazar URL y archivo simultáneos. El dominio comprueba estructura, base64, tamaño y firma sin decodificar imágenes; la selección en el navegador añade comprobación de dimensiones y decodificación. Mantener alternativa local y reintento ante fallos. Esta decisión sustituye el paso «Mostrar portada» de ADR-008.
5. Mantener las imágenes remotas fuera de las reglas de caché del service worker. Las imágenes locales pertenecen a IndexedDB y al respaldo, y están disponibles offline; no son recursos de la aplicación ni la foto temporal de Apariencia. El respaldo conserva su límite total de 20 MiB, incluida la expansión base64.
6. Usar DB5/nativa50 y respaldo3, conservando trece tablas e índices previos. Admitir las bases v1 a v4 y los respaldos1/2 con sus contratos históricos estrictos, sin regenerar IDs o inventar metadatos. Esta evolución sustituye DB4/respaldo2 como contrato vigente de ADR-008 y conserva sus definiciones históricas.
7. Invalidar la referencia de catálogo cuando cambien título o identidad de créditos. Mantenerla en correcciones que no cambien esa identidad musical. No enriquecer automáticamente registros existentes ni ampliar el contexto de IA: géneros, países y portadas quedan fuera de sus solicitudes.

## Alternativas

| Alternativa                                     | Evaluación                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Crear otro álbum para corregir un error         | Fragmentaría notas, colección, listas e identidad de un mismo registro                     |
| Renombrar un artista compartido desde una ficha | Modificaría también álbumes ajenos a la corrección del nombre                              |
| Guardar imágenes locales sólo como Blob URL     | Su referencia caducaría y no permitiría reapertura ni respaldo                             |
| Descargar y cachear cualquier URL de portada    | Añadiría copia de contenido externo, dependencia de CORS y otro contrato de almacenamiento |
| Catálogo obligatorio de géneros o países        | Impediría registrar información libre o incompleta sin mejorar la identidad musical        |

## Consecuencias

El flujo permite corregir registros sin reconstruir la biblioteca. País es un dato del artista y puede afectar a varios álbumes que comparten su ID; el editor debe hacer visible ese alcance. La comparación del estado esperado preserva cambios concurrentes y exige actualizar ante un conflicto.

La portada por URL puede contactar a su proveedor al aportar el enlace o abrir biblioteca/ficha. Mantiene una política sin referrer y no expone claves de recomendaciones. La portada local usa espacio de IndexedDB y del respaldo; no se promete capacidad ilimitada ni protección ante borrado de datos del navegador.

La ampliación requiere validar migraciones, archivos previos, conservación de relaciones, límites de imágenes, uso offline y accesibilidad antes de integrar y publicar. El incremento se revisa en la misma PR #58; no modifica la release v1.0.0 ni inicia sincronización.
