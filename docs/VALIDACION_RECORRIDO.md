# Validación del recorrido principal

Preparación: 27 de octubre de 2026 · Aceptación: 28 de octubre de 2026 · Actualización documental: 29 de octubre de 2026.

Este informe reúne la validación técnica del recorrido posterior al MVP y la aceptación final comunicada de escritorio. [UX-07 #72](https://github.com/NicoCG32/Auditorium/issues/72) y [su coordinación #60](https://github.com/NicoCG32/Auditorium/issues/60) están completadas; las actas de las issues registran la aceptación del 28 de octubre. Los resultados automáticos se mantienen separados de la revisión de uso.

## Contrato que se revisa

Biblioteca → Añadir álbum → Calificaciones → Mi colección es el recorrido principal. La ficha conecta las tareas sin exigir una cuenta, una coincidencia de catálogo, una nota o una adquisición para incorporar música.

| Concepto    | Identidad y comportamiento esperado                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Álbum       | Una entrada musical, aunque tenga tres ediciones; título, artistas, géneros y clasificación pertenecen a sus datos                      |
| Experiencia | Escucha y comentario personales; nota general y notas por género opcionales e independientes, sin promedio ni sustitución               |
| Edición     | Original, Deluxe o Aniversario pueden existir en físico o digital; una referencia de valoración no exige poseerla                       |
| Enlace      | Escuchar o Comprar, con favorito de reproducción opcional; no representa propiedad ni calificación                                      |
| Audio local | Archivo conservado en este dispositivo y aislado por biblioteca; no viaja en JSON ni sincronización, tiene respaldo completo ZIP propio |
| Adquisición | Cada copia física o compra digital, con metadatos propios; editarla o retirarla conserva el álbum y las ediciones compartidas           |
| Deseo       | Intención de compra independiente, fuera de los recuentos de propiedad                                                                  |

Incorporar un álbum expresa valor para la persona. Una nota de 1 es una comparación dentro de su biblioteca y no presupone rechazo. La base usada para mostrar, ordenar y filtrar una nota debe ser visible.

## Evidencia técnica reproducible

Las pruebas operan sobre compilaciones de producción, perfiles aislados y datos ficticios. No requieren claves, correo real ni acceso a bibliotecas habituales. La evidencia de CI debe corresponder al commit integrado; el enlace al run y su resultado se registran en la issue, sin convertir un resultado anterior en prueba de cambios posteriores.

| Límite comprobado                       | Prueba y resultado exigido                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interfaz → alta → persistencia          | [main-journey.spec.ts](../e2e/main-journey.spec.ts): partir de vacío, registro manual sin consulta remota, enlace favorito, corrección y cancelación de salida conservando el borrador                                                                                                                                        |
| Persistencia → ficha y destinos         | Mismo recorrido: un álbum, tres ediciones, general y dos géneros con cifras diferentes, recalificación, referencia de edición sin poseerla, copia física y compra digital, deseo y filtrado por nota contextual                                                                                                               |
| Exportación → otro perfil → lectura     | Descargar el JSON real, restaurarlo en un destino nuevo y comprobar igualdad completa de datos e identidad; el favorito, referencias y adquisiciones se conservan                                                                                                                                                             |
| Lectores anteriores y migraciones       | [backup.test.ts](../src/domain/backup.test.ts), [rate-genres-backup.test.ts](../src/domain/rate-genres-backup.test.ts) y [rate-genres-migration.test.ts](../src/infrastructure/repositories/rate-genres-migration.test.ts): contratos históricos estrictos, checkpoint migrado sin notas inventadas y aborto por incoherencia |
| Referencias, conflictos y renombrado    | [album-experience.spec.ts](../e2e/album-experience.spec.ts), [genre-ratings.spec.ts](../e2e/genre-ratings.spec.ts) y pruebas de dominio/aplicación: selección propia, eliminación, comparación concurrente, no sobrescritura y notas generales/contextuales independientes                                                    |
| Copias y deseos                         | [collection.spec.ts](../e2e/collection.spec.ts): filtros, edición y eliminación de una copia, cancelación, conflictos y conservación de catálogo, experiencia, enlaces y deseos                                                                                                                                               |
| Vacío, sin coincidencias, carga y fallo | [library.spec.ts](../e2e/library.spec.ts), [navigation.spec.ts](../e2e/navigation.spec.ts), [acceptance.spec.ts](../e2e/acceptance.spec.ts) y pruebas de interfaz: estado explícito, borrador protegido y reintento de lectura sin repetir escritura                                                                          |
| Pantallas y texto                       | Segundo caso de main-journey: Oscuro/Pergamino, 320/1280 px y tamaño raíz al 200 %, sin desplazamiento horizontal, auditoría axe y capturas en los cuatro destinos                                                                                                                                                            |
| Teclado, historial y foco               | navigation, aceptación, sugerencias locales y notas por género comprueban Tab, Enter, Escape, regreso al origen y resolución explícita de cambios sin guardar                                                                                                                                                                 |
| Reproducción y archivos                 | [streaming.spec.ts](../e2e/streaming.spec.ts), [local-audio.spec.ts](../e2e/local-audio.spec.ts) y [pages.spec.ts](../e2e/pages.spec.ts): carga elegida, cierre/cancelación, alternativa externa, audio local offline y restauración ZIP; respuestas de proveedores simuladas                                                 |
| Cuenta y sincronización                 | [cloud.spec.ts](../e2e/cloud.spec.ts): dos dispositivos simulados, aislamiento y conflictos con servicio ficticio; no prueba dispositivos físicos ni entrega de correo real                                                                                                                                                   |

Ejecutar `npm run check` y después `npm run test:e2e`, de forma secuencial. El caso focal se reproduce con `npx playwright test e2e/main-journey.spec.ts`. Chromium, Firefox y WebKit están incluidos en la configuración. Las capturas se generan en `test-results/` durante la ejecución; no contienen una biblioteca real. CI conserva el diagnóstico de navegador cuando falla.

El tamaño raíz al 200 % es una prueba de ampliación de texto y reflujo; no equivale a todas las modalidades de zoom del navegador. Axe no certifica conformidad WCAG ni sustituye lectores de pantalla, revisión visual o pruebas con personas. Los límites por plataforma de [validación del MVP](VALIDACION_MVP.md#límites-de-la-evidencia), [PWA](PWA_OFFLINE.md), [reproducción](REPRODUCCION.md) y [audio local](AUDIO_LOCAL.md) siguen aplicándose.

## Hallazgos de la inspección técnica

La ampliación de texto al 200 % reprodujo un desbordamiento en Calificaciones: a 320 px el buscador extendía el documento a 329 px. Se adapta su anchura al contenedor usando los mismos límites y estilo de los controles de valoración; la regresión comprueba el ancho real del documento, sin ocultar contenido mediante recorte. Este hallazgo procede de una prueba técnica, no de una sesión con participantes.

WebKit reprodujo también 322 px de ancho en el alta: la acumulación de espacios interiores dejaba poco sitio al control nativo de archivo. Los paneles estrechos ajustan sus márgenes interiores al ancho disponible y el botón de archivo puede partir su texto. La navegación distribuye sus columnas según el espacio que necesitan las etiquetas ampliadas, y el acceso por teclado al contenido mantiene un ancho limitado a la ventana.

Se actualizaron también las guías que todavía presentaban Mi colección y la sincronización como trabajo pendiente. Los contratos históricos conservan su contexto; la matriz actual señala qué está implementado y qué aceptación falta.

## Sesión de revisión preparada

Usar una ventana privada o un perfil vacío y una biblioteca de prueba sin cuenta. No restaurar respaldos ficticios sobre una biblioteca habitual. No compartir contraseñas, claves, enlaces de acceso, música propia ni capturas de datos personales. El formulario puede usar nombres inventados y `https://audio.example/album/horizonte` como enlace ficticio; no se espera que ese dominio reproduzca música.

La persona que revisa recibe estos objetivos, sin nombres de botones ni indicaciones sobre dónde pulsar. Quien observa espera, pide que explique su intención y registra cualquier ayuda ofrecida. Si necesita ayuda, el resultado es «con ayuda» aunque después complete el objetivo.

1. Guarda un álbum inventado que todavía no figure en tu catálogo, con dos géneros y un enlace de escucha favorito. No necesitas poseerlo ni calificarlo.
2. Corrige un dato que escribiste mal. Inicia otra corrección, intenta cambiar de tarea y recupera lo que estabas escribiendo sin guardarlo todavía.
3. Añade tres ediciones de ese álbum. Valora tu experiencia general y dos géneros con notas distintas; elige una edición de referencia que aún no poseas. Revalora la general sin perder esa referencia.
4. Encuentra el álbum comparando por uno de los géneros. Explica qué cifra está usando la aplicación y qué significa la ausencia de nota en otro género.
5. Registra una copia física y una compra digital. Corrige una copia y quita sólo esa adquisición; explica qué datos del álbum esperas conservar.
6. Registra un deseo de compra y explica si cuenta como algo que ya posees. Explica también si guardar un enlace o adjuntar un archivo significa que compraste el álbum.
7. Guarda lo pendiente y descarga el respaldo adecuado. Explica qué respaldo necesitarías para conservar un archivo de audio y qué necesitarías volver a seleccionar en otro dispositivo.

Repetir las tareas de consulta y una edición en pantalla estrecha y escritorio, ambos temas y teclado. Probar ampliación real de texto/zoom con las preferencias del navegador y anotar navegador y modalidad. Las pruebas automatizadas aportan otra evidencia; no rellenan los resultados de esta sesión.

## Registro y cierre

| Campo                  | Cómo registrarlo                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto               | Código anónimo de sesión, revisión del producto, navegador, ancho, tema y modalidad de entrada/zoom; sin correo ni nombre personal               |
| Resultado por objetivo | Completado sin ayuda / con ayuda / incompleto; acción observable, dudas, retrocesos, error y ayuda recibida                                      |
| Comprensión            | Explicación de álbum/edición/copia, general/género, nota baja, enlace/propiedad y respaldo JSON/ZIP; no inferirla de haber pulsado correctamente |
| Hallazgo               | Reproducción con datos ficticios, consecuencia, prioridad y referencia a la corrección; conservar observaciones personales fuera del repositorio |
| Comprobación posterior | Repetir el objetivo afectado después de corregirlo, indicando si la duda se resolvió                                                             |

La revisión comunicada de escritorio describió el recorrido como entendible y simple, sin dudas concretas informadas. Después se recibió la confirmación final de revisión, que resolvió la reserva sobre borrador, tres ediciones/referencia no poseída y respaldo/restauración. Se registra como autoinforme y aceptación de producto; no se inventan observaciones directas, mediciones, pasos individuales o pruebas móviles no comunicados. Esta revisión formativa no demuestra que toda la población comprenda la aplicación.

La revisión y las correcciones principales quedaron aceptadas con CI aprobada del cambio integrado; #72 y #60 están cerradas. El hito de experiencia completó sus diez tareas. Para futuras revisiones, priorizar pérdida/confusión de datos o tarea bloqueada; después, pasos que requieran ayuda o induzcan interpretaciones incorrectas; por último, detalles visuales sin efecto sobre la tarea. Publicar main o preparar un paquete no sustituye la aceptación de producto. La [entrega 1.1.0](ENTREGA.md) consolida el incremento sin ampliar los límites de la evidencia.
