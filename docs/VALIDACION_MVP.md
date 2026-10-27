# Validación final del MVP

MVP-05 completó la aceptación de las Fases 0–4 mediante la PR #46 integrada. La versión `1.0.0` distribuye ese MVP local, con su guía y la evidencia de validación. La preparación de cada release verifica el commit exacto de entrega antes de etiquetarlo y publicar el paquete.

La [validación del recorrido principal posterior al MVP](https://github.com/NicoCG32/Auditorium/blob/main/docs/VALIDACION_RECORRIDO.md) incorpora enlaces, clasificación, notas por género, Mi colección, reproducción y audio local. Mantiene explícitamente pendiente la revisión de comprensión con participantes y no cambia retrospectivamente el alcance de v1.0.0. El informe ampliado se consulta en el repositorio y no forma parte de este paquete estático.

## Matriz de aceptación reproducible

| Alcance                                     | Evidencia                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta, búsqueda, lista y ficha               | Recorrido E2E con dos álbumes creados mediante la interfaz en Chromium, Firefox y WebKit                                                           |
| Nota de álbum, escucha, comentarios y pista | Guardado, reapertura y respaldo leído; notas de álbum y pista independientes                                                                       |
| Edición y pista compartida                  | Edición copiada de lista original conserva la nota de la pista                                                                                     |
| Copias y deseos                             | Dos copias, cumplimiento explícito con compra coincidente y eliminación de una copia sin afectar la otra                                           |
| Retirada reversible                         | Retirar y restaurar la misma entrada conserva experiencia, notas, colección y deseos                                                               |
| Respaldo y restauración                     | Descarga JSON real, restauración en destino vacío, igualdad de datos e identidad y rollback por fallo tardío                                       |
| Uso offline y actualizaciones               | Chromium: reapertura sin red, operaciones completas, actualización con dos ventanas y descarga fallida recuperable                                 |
| Migraciones y errores                       | Chromium: esquemas históricos v1/v2, reinicio en proceso nuevo, bloqueo, cuota, aborto, datos/esquemas inválidos y protección denegada             |
| Accesibilidad automática                    | axe sobre estados vacíos, formularios, validación, previsualización de respaldo, ficha, listas, colección, deseos y confirmaciones en tres motores |
| Teclado y foco                              | Salto al contenido, Enter, foco al abrir/cancelar, Escape en confirmación y foco visible en detalles de almacenamiento                             |
| Pantallas                                   | 320, 768 y 1280 px; texto al 200 % a 320 px; movimiento reducido; controles y formularios sin desborde horizontal                                  |
| Entrega                                     | Build estático con PWA, documentación, avisos de dependencias e inventario de archivos y SHA-256                                                   |

`npm run check` exige formato, lint sin advertencias, tipos estrictos, pruebas de dominio/aplicación/interfaz/persistencia y build. `npm run test:e2e` ejecuta los casos anteriores en producción con perfiles aislados y datos ficticios. No hay reintentos automáticos. Las pruebas de ciclo de service worker y reinicio de proceso se concentran en Chromium; Firefox y WebKit ejecutan la aceptación principal.

Las auditorías incluyen reglas WCAG 2 A/AA, 2.1 A/AA y 2.2 AA disponibles en axe, incluido contraste del texto. El [contraste mínimo de WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) exige 4,5:1 para texto normal y 3:1 para texto grande. Se comprueba además [foco visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) mediante teclado. Véanse los [límites de la auditoría automática](https://playwright.dev/docs/accessibility-testing) y los [motores de Playwright](https://playwright.dev/docs/browsers).

## Límites de la evidencia

No se ha certificado conformidad WCAG ni realizado una evaluación completa con lectores de pantalla, dispositivos móviles reales o instalación nativa en Safari/iOS. Cambiar el tamaño raíz de texto al 200 % verifica adaptación del contenido; no sustituye todas las modalidades de zoom del navegador. No se han medido cargas de bibliotecas grandes ni rendimiento en hardware de baja memoria. Los mensajes de error y recuperación conservan los datos y evitan presentar un conteo cero cuando la lectura aún no está disponible.

En WebKit para Windows, la navegación nativa por Tab omite enlaces y botones. La prueba selecciona esos dos destinos explícitamente y comprueba Enter, Escape y devolución del foco; el orden de Tab se verifica en los demás motores y en WebKit de Linux en CI. Safari en macOS puede necesitar [Option-Tab o activar la navegación completa](https://support.apple.com/en-gb/guide/safari/cpsh003/mac).

El MVP funciona localmente. La evidencia de esta página corresponde al MVP y a los hitos aquí indicados; las [integraciones opcionales AI-01/CAT-01](INTEGRACIONES_OPCIONALES.md) posteriores tienen contratos y límites de verificación propios. La [cuenta y sincronización opcionales](SINCRONIZACION_SUPABASE.md) ya tienen implementación posterior al MVP, sin exigir cuenta para la biblioteca local. La [guía de entrega](ENTREGA_MVP.md) describe uso y límites de almacenamiento. El hito WEB-01 añade la [publicación Pages](PUBLICACION_WEB.md), con E2E Chromium adicionales bajo `/Auditorium/`: recursos/manifest/MIME e instalabilidad, operaciones y reapertura offline, límite del scope, actualización con varias ventanas y recuperación ante fallo. El recorrido raíz se conserva en los tres motores.
