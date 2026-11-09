# Derechos y recursos

[Índice](README.md) · [Licencia del código](../LICENSE) · [Condiciones de uso](../LICENSING.md) · [Avisos](../NOTICE)

## Código, identidad y contenido musical

La licencia del software y los permisos del contenido que guardas en la biblioteca tienen alcances distintos.

| Material                          | Referencia y condiciones                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código y documentación originales | [PolyForm Noncommercial 1.0.0](../LICENSE), con las condiciones de [LICENSING.md](../LICENSING.md) y los avisos de [NOTICE](../NOTICE)                                    |
| Identidad visual                  | El [catálogo de marca](../branding/README.md) reúne logos, banners e iconos. Los materiales de terceros que se utilicen en una composición conservan sus propios derechos |
| Música, grabaciones y portadas    | Conservan los derechos de sus titulares. Registrarlas, enlazarlas o adjuntarlas a Auditorium no concede permiso para redistribuirlas                                      |
| Dependencias de software          | Sus licencias y avisos se incluyen en `THIRD_PARTY_NOTICES.md` al generar el paquete web                                                                                  |
| Servicios externos                | El uso de cada servicio está sujeto a sus términos y a las condiciones del contenido que ofrece                                                                           |

## Audio local y respaldos

El audio adjunto se guarda en IndexedDB del dispositivo. El respaldo completo ZIP1 permite trasladarlo junto con la biblioteca; el JSON7 y la sincronización de cuenta transportan metadatos y excluyen esos archivos.

Conserva los permisos aplicables a cada grabación antes de copiarla o compartirla. Un archivo guardado localmente puede seguir perteneciendo a un tercero; el respaldo no cambia sus condiciones de uso.

Los ZIP completos no están cifrados y pueden incluir notas personales y archivos musicales. Guárdalos en un lugar privado y evita adjuntarlos a issues o ejemplos públicos. La [guía de audio](AUDIO_LOCAL.md) detalla el formato y sus límites.

## Archivos sintéticos de prueba

Los ocho archivos `tone-*` de [las muestras de audio](../prototypes/audio-01/fixtures/README.md) son tonos de 440 Hz generados por un script. Se ofrecen bajo [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/); el código del generador conserva la licencia del repositorio. Esta condición corresponde a esas muestras, no a los archivos que se adjunten a una biblioteca.

## Portadas, metadatos y servicios

- **Portadas:** pueden provenir de una URL o de un archivo seleccionado. Su almacenamiento y visualización conservan los derechos y permisos de la imagen original.
- **Wikidata:** aporta candidatos de metadatos que se revisan antes de incorporarlos. Las fuentes y sus avisos se conservan según el material utilizado.
- **Spotify y YouTube:** se abren mediante enlaces o reproductores oficiales. Auditorium no extrae ni redistribuye su señal musical.
- **Gemini y Groq:** reciben un contexto acotado para proponer recomendaciones; sus términos se aplican a esas solicitudes.

La [guía de integraciones](tecnica/05-integraciones-y-seguridad.md) explica los datos transmitidos y los controles de cada función. La [evaluación de MusicBrainz](METADATOS_EXTERNOS.md) conserva la investigación de ese proveedor.

## Distribución y atribución

El [generador del paquete web](../scripts/package.mjs) incluye `LICENSE`, `NOTICE`, `LICENSING.md`, el catálogo `branding/` y `THIRD_PARTY_NOTICES.md`. Este último reúne las licencias y los avisos encontrados en las dependencias de ejecución; las imágenes, la música y los servicios externos tienen condiciones propias.

Al incorporar o redistribuir un recurso, conserva su origen, licencia y atribuciones. Las condiciones del código y las solicitudes de uso comercial se detallan en [LICENSING.md](../LICENSING.md).
