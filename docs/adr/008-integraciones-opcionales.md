# ADR-008 — Referencias de catálogo y recomendaciones opcionales

Estado: aceptada para el incremento AI-01/CAT-01; sustituida parcialmente por [ADR-009](009-edicion-metadatos-portadas.md) en versiones de datos e interacción de portada. Pendiente de integración y validación de entrega.
Fecha: 2026-10-17.
Referencia: [guía de integraciones](../INTEGRACIONES_OPCIONALES.md), [AI-01](https://github.com/NicoCG32/Auditorium/issues/56) y [CAT-01](https://github.com/NicoCG32/Auditorium/issues/57).

## Contexto

Después del MVP local y de su publicación en Pages, se incorpora búsqueda de referencias al registrar álbumes y un orden de recomendación basado en altas recientes. El funcionamiento local conserva su independencia de cuentas y servicios. Pages distribuye archivos estáticos y no puede ocultar una clave compartida dentro del cliente.

La propuesta [ADR-007](007-importacion-metadatos.md) estudia un importador local de JSON de ediciones de MusicBrainz. Ese importador sigue pendiente: buscar un álbum en Wikidata no importa ediciones, pistas ni archivos. MusicBrainz exige una identificación de cliente cuya emisión desde el navegador debe resolverse antes de habilitar una consulta directa conforme. Wikimedia documenta explícitamente aplicaciones JavaScript con el User-Agent nativo y recomienda `Api-User-Agent`.

## Decisión

1. Usar Wikidata Action API para consultas explícitas, anónimas, acotadas y cancelables. Recuperar créditos en lotes y validar entidad musical e IDs antes de ofrecer candidatos. No buscar por cada pulsación ni usar scraping de Metallum.
2. Exigir selección humana y revisión del borrador antes del guardado local. Preservar créditos múltiples, UUID locales y reglas de duplicados. Cambiar título o artista invalida la asociación; el fallo del catálogo nunca impide el registro manual.
3. Guardar una referencia estricta opcional en `Album`, con proveedor, QID, fecha y referencias MusicBrainz/Spotify/YouTube existentes. No copiar respuestas arbitrarias ni aceptar enlaces generados por un modelo como evidencia de catálogo.
4. Decisión histórica: publicar una barrera de compatibilidad DB4/nativo40 conservando las trece tablas e índices de v3 y exportar respaldo v2 con entrada v1 estricta. ADR-009 sustituye el contrato vigente por DB5/respaldo3, con entrada v1/v2 estricta; mantiene identidad e IDs.
5. Ofrecer la URL de portada representativa de Cover Art Archive como elección independiente. La decisión original exigía «Mostrar portada» y excluía binarios del respaldo; ADR-009 la sustituye por carga automática de URL y una fuente local JPEG/PNG opcional, persistida y exportable. Las imágenes remotas siguen fuera de la precaché y su referencia no garantiza imagen, edición exacta o derechos de redistribución.
6. Integrar Groq y Gemini mediante REST y modelos fijados, sin SDK ni dependencias adicionales para una solicitud de orden estructurado. Usar clave propia de cada persona sólo en memoria; nunca compilar, compartir, registrar o persistir claves.
7. Enviar sólo un conjunto acotado de candidatos y señales mínimas tras acción explícita y explicación de datos/política. Resolver referencias efímeras a UUID localmente. Validar respuesta y pertenencia; ninguna sugerencia escribe en la biblioteca.
8. Aplicar timeout, cancelación y errores sanitizados. No efectuar reintentos, generación al guardar ni cambio automático de proveedor. La cuota gratuita pertenece a la cuenta del usuario; la aplicación no activa pagos ni garantiza uso ilimitado.

## Alternativas

| Alternativa                                             | Evaluación                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Clave compartida incorporada al build                   | Expondría el secreto y compartiría cuota entre visitantes; requiere otro diseño y servicio intermedio                       |
| Guardar la clave en almacenamiento del navegador        | No cumple la duración elegida de memoria de la pestaña y la expone en recuperaciones o inspección posterior                 |
| Servidor propio para todo el catálogo y recomendaciones | Añade operación, costos y otro receptor de datos; no es necesario para este incremento optativo                             |
| Consulta directa de MusicBrainz desde Pages             | El éxito HTTP/CORS no resuelve por sí solo su requisito de identificación; se mantiene como referencia y evolución separada |
| Coincidencia automática por título                      | No distingue homónimos, créditos, tipos o ediciones; no autoriza crear ni fusionar identidades                              |
| Enviar el snapshot completo al modelo                   | Comparte notas, identidad y colección sin necesidad para el orden solicitado                                                |

## Consecuencias

La biblioteca continúa siendo local y usable sin los servicios; sólo estas acciones requieren red. Las referencias seleccionadas son durables y exportables, mientras claves y recomendaciones son transitorias. Cambia el contrato de datos y exige pruebas de migración y compatibilidad antes de integrar.

El usuario y su navegador siguen siendo responsables de la clave introducida. El proveedor recibe el contexto reducido y datos de conexión conforme a sus condiciones. Gemini no pagado puede usar contenido para mejora/revisión según región; Groq contempla excepciones a su ausencia de retención por defecto. La interfaz debe explicar esas diferencias antes del envío, sin prometer confidencialidad absoluta.

La cobertura y exactitud del catálogo, disponibilidad de enlaces, derechos de portadas, cuotas y calidad de sugerencias tienen límites externos. Las pruebas simuladas y de CORS no sustituyen una inferencia autenticada con una cuenta propia. La sincronización, reproducción, importador MusicBrainz JSON y enriquecimiento de registros existentes conservan alcances separados.
