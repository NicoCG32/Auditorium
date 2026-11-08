# Derechos de autor, recursos y contenido musical

[← Índice](README.md) · [Licencia del código](../LICENSE) · [LICENSING.md](../LICENSING.md) · [Avisos](../NOTICE)

## Cuatro clases de material que no hay que confundir

Auditorium es una aplicación **personal e independiente**, desarrollada por **un solo participante humano**, con apoyo de herramientas de inteligencia artificial bajo sus decisiones e instrucciones. Esta descripción acredita la forma de trabajo del proyecto; **no convierte obras musicales de terceros ni todos los recursos externos en propiedad del desarrollador**.

| Material | Procedencia y uso | Qué autoriza la documentación |
| --- | --- | --- |
| **Código y documentación originales** | Trabajo del proyecto; paquete distribuido con `LICENSE`, `NOTICE`, `LICENSING.md` | **PolyForm Noncommercial 1.0.0**, dentro de los derechos de quien licencia |
| **Identidad gráfica Auditorium** | Logos, banners, fondos, iconos y texturas en `branding/` y `public/auditorium/` | **No se ha inventariado por pieza** el proceso de creación ni los eventuales materiales de partida. No presumir permiso general de marcas/insumos ajenos |
| **Álbumes, canciones y portadas** | Obras, grabaciones, nombres, imágenes y enlaces que cada persona registra o consulta | **No** quedan cubiertos por la licencia de código; usar la aplicación no concede derechos para reproducir, modificar, publicar o compartir música de terceros |
| **Bibliotecas de software y servicios** | React, Dexie, Supabase, Vite, Spotify/YouTube, Wikidata, Gemini/Groq y otros | Licencias de paquetes, derechos de base de datos y términos de servicio **independientes** del proyecto |

## Audio local: conservar no es distribuir

La aplicación permite que cada persona **adjunte archivos de audio propios** a su biblioteca y los transporte mediante un ZIP completo. Eso **no implica** que esos archivos sean necesariamente composiciones propias o estén autorizados para redistribución.

- El audio se guarda en **IndexedDB del dispositivo** y puede incluirse en un **ZIP1 exportado por la persona**. **El JSON7 y la sincronización Supabase excluyen los bytes de audio**.
- Para importar, escuchar, copiar o compartir una grabación, corresponde contar con los derechos o permisos aplicables. La función de respaldo no concede permiso para compartir públicamente un ZIP musical.
- El código permite enlazar **Spotify y YouTube** mediante sus reproductores y flujos oficiales. El acceso depende de los proveedores y sus condiciones; no hay un servidor de Auditorium que distribuya pistas.
- Un enlace de descarga o una portada externa **no prueba** titularidad ni autorización para republicar el recurso.
- Los ZIP completos **no están cifrados**. No deben publicarse accidentalmente como adjuntos de issues, ejemplos o paquetes de distribución.

## La excepción de los archivos de prueba

Los ocho archivos `tone-*` incluidos en [`prototypes/audio-01/fixtures/`](../prototypes/audio-01/fixtures/README.md) son **tonos sintéticos de 440 Hz** generados mediante un script, no canciones, interpretaciones ni grabaciones de artistas. Su documentación los ofrece como **CC0-1.0**. El código del generador y el resto del proyecto conservan sus licencias respectivas.

**No** extrapolar el permiso CC0 de estos tonos a archivos que un usuario adjunte ni a imágenes de portadas.

## Metadatos y servicios externos

- **Wikidata**: las referencias y candidatos llegan mediante consulta voluntaria; el resultado se revisa antes de incorporarlo. Las licencias y condiciones de las fuentes deben conservarse según el material usado.
- **MusicBrainz**: existe una evaluación técnica de correspondencias, pero no se debe presentar como una importación remota plenamente habilitada por esa investigación. [Estudio histórico](METADATOS_EXTERNOS.md).
- **Gemini/Groq**: recomendaciones voluntarias con clave del usuario en memoria y contexto acotado; la salida propuesta **no** modifica notas ni adquiere derechos sobre datos de terceros.
- **Spotify/YouTube**: marcos y enlaces oficiales, sin extracción ni redistribución de la señal musical desde Auditorium.
- **Portadas**: pueden provenir de URL o de un archivo seleccionado por la persona. La portada es un recurso distinto de la propiedad de `Album`; su visualización en una fonoteca **no la relicencia**.

## Dependencias y paquete de distribución

El script [`scripts/package.mjs`](../scripts/package.mjs) prepara la release web e incluye `LICENSE`, `NOTICE`, `LICENSING.md`, `branding/` y un **`THIRD_PARTY_NOTICES.md` generado** a partir de las licencias y avisos encontrados en paquetes de ejecución. Ese archivo es una ayuda técnica concreta, **no prueba que todo recurso visual, todos los metadatos o los términos de los proveedores externos estén auditados**.

Para cambios nuevos, verificar:

1. Si el recurso es código, tipografía, portada, audio, logo, diseño, base de datos o dato textual.
2. Quién lo proporcionó, si contiene materiales externos y qué términos aplican a su reproducción y distribución.
3. Si se incluye **realmente en el bundle**, en los originales de `branding/` o solo como enlace externo.
4. Qué atribución o aviso debe conservarse antes de modificar `NOTICE` u otros archivos.
5. Que capturas, pruebas y respaldos usados públicamente no expongan colecciones privadas ni audio protegido.

## Decisión actual

Se mantiene el texto de [PolyForm Noncommercial 1.0.0](../LICENSE) para el código original, con [NOTICE](../NOTICE). **No se modifica por esta revisión ni se concede licencia sobre obras musicales ajenas.** La autoría de las piezas visuales individuales y las obligaciones adicionales de recursos externos deben verificarse con evidencia, no rellenarse por analogía.
