# ADR-007 — Importación de metadatos mediante revisión local

Estado: **propuesta para implementación posterior**.
Fecha: 2026-10-14.
Referencia: [evaluación EXT-01](../METADATOS_EXTERNOS.md).

## Contexto

Auditorium mantiene identidades musicales locales, pistas contextuales al álbum y una biblioteca personal independiente del catálogo. Los metadatos externos pueden reducir el registro manual, pero sus entidades, créditos, formatos e identidades no coinciden completamente con esos contratos. Una importación automática puede cambiar relaciones que sostienen valoraciones e historial.

En el momento de este estudio, la PWA carecía de un transporte remoto identificado y de un contrato persistente de procedencia para importar ediciones de MusicBrainz. Las restricciones y fuentes verificadas se describen en la evaluación; la compatibilidad se prueba offline, sin introducir una integración de producto.

## Decisión propuesta

1. Empezar por un archivo JSON core de edición, con validación, propuesta visible y confirmación local. La adquisición del archivo es externa a Auditorium; no se presume autenticidad por su etiqueta de origen.
2. Mantener el UUID local como identidad. Guardar correspondencias externas con el tipo y contexto adecuados mediante un contrato propio; los MBIDs no reemplazan IDs ni autorizan fusión.
3. Reutilizar pistas únicamente por selección explícita dentro del mismo álbum. Una grabación compartida entre álbumes se representa mediante pistas locales diferentes. Las variantes necesitan una decisión musical, no una deducción por título.
4. Revisar créditos, tipo, formato y posiciones no representables. Elegir la lista original expresamente; importar otra edición conserva esa referencia.
5. Separar el plan de revisión del snapshot. Incorporar procedencia persistente requiere migración, integridad y respaldo coordinados antes de guardar nuevos campos.
6. Enriquecer solo el catálogo seleccionado y su procedencia, conservando identidad, entradas activas/retiradas, notas, calificaciones, ejemplares y deseos. Añadir a la biblioteca es otra acción explícita.
7. Revalidar el destino y la referencia esperada dentro del commit atómico. Un conflicto vuelve a revisión; una lectura fallida después del commit se recupera sin repetir la escritura.
8. Evaluar después un adaptador remoto de lectura, condicionado a identificación efectiva, condiciones de uso, límite agregado y privacidad. Las portadas conservan una tarea propia sobre derechos y almacenamiento.

## Alternativas evaluadas

| Alternativa                                 | Evaluación                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Importación automática de toda la respuesta | No permite revisar pérdidas ni preservar decisiones locales; mezcla campos con contratos y licencias distintos |
| Reemplazar UUID locales por MBID            | Rompe referencias y no representa una grabación contextual a varios álbumes                                    |
| Usar `fetch` directamente desde la PWA      | Requiere demostrar identificación, CORS y coordinación del límite compartido antes de habilitarse              |
| Desplegar inmediatamente un intermediario   | Introduce operación, costos y otro receptor de consultas antes de validar el flujo local                       |
| Archivo local con revisión                  | Permite comprobar identidad y experiencia de importación sin comprometer transporte o infraestructura          |

## Consecuencias

El primer incremento propuesto es acotado y funciona offline después de adquirir el archivo. No resuelve búsqueda remota, autenticidad del origen, importación completa, portadas ni sincronización. Requiere una interfaz de revisión y un contrato externo distinto del respaldo; no reutiliza `restoreEmpty` ni adopta la identidad del archivo.

Este estudio conservó los schemas, tablas y formato de respaldo del MVP v1.0.0; tampoco cambió dependencias ni añadió capacidades de importación a la aplicación. El incremento posterior [ADR-008](008-integraciones-opcionales.md) incorpora búsqueda Wikidata y referencia de álbum con DB4/respaldo2; no implementa el importador de JSON de ediciones descrito aquí. La distribución y la identidad visual posteriores a esa release se mantienen. Aprobar esta decisión permitiría refinar los incrementos descritos en la evaluación; cada implementación mantiene sus propios criterios y PR.
