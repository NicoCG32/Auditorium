# Referencia ampliada de uso

Esta guía conserva las instrucciones detalladas del README anterior. Para el estado y las descargas vigentes consulta el [README principal](../README.md); para la licencia y créditos, [LICENSING](../LICENSING.md).

# Auditorium

Auditórium es una biblioteca musical personal para organizar los álbumes que conoces, escuchas, calificas, posees y deseas adquirir, con independencia del formato y de las plataformas de streaming.

**Versión 1.1.0.** La [web/PWA](https://nicocg32.github.io/Auditorium/) se publica desde revisiones validadas de main. La [release v1.1.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.1.0) reúne las mejoras posteriores al MVP y distribuye el sitio estático, la guía y el checksum. Consulta la [guía de entrega](../docs/ENTREGA.md) y el [changelog](../CHANGELOG.md). La release v1.0.0 conserva su [distribución original](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0).

El recorrido principal sigue **Biblioteca → Añadir álbum → Calificaciones → Mi colección**. Permite registrar y corregir datos, guardar enlaces de reproducción/compra y un favorito, y consultar música mediante búsqueda, filtros y vistas. Géneros, tipo y categorías pertenecen al álbum; país y créditos identifican a sus artistas. Las sugerencias locales y la capitalización conservan una elección explícita de identidad. Las portadas por URL se cargan automáticamente y las imágenes locales validadas quedan disponibles offline.

[Mi experiencia](../docs/MI_EXPERIENCIA.md) reúne escucha, comentario y notas opcionales. Las [valoraciones por género](../docs/VALORACIONES_POR_GENERO.md) son independientes de la general y de las pistas; cada una puede indicar una edición de referencia del mismo álbum sin exigir posesión. Biblioteca y Calificaciones explican qué nota comparan. Un álbum puede tener varias ediciones y varias copias dentro de una única entrada musical. [Mi colección](../docs/MI_COLECCION.md) permite corregir o retirar cada adquisición, con recuentos físicos/digitales diferenciados y deseos secundarios.

La [reproducción desde enlaces](../docs/REPRODUCCION.md) carga Spotify/YouTube por elección y mantiene una alternativa externa. El [audio propio](../docs/AUDIO_LOCAL.md) se conserva por dispositivo y usa un respaldo ZIP completo; los archivos no se sincronizan ni forman parte del JSON musical. Las [integraciones opcionales](../docs/INTEGRACIONES_OPCIONALES.md) añaden referencias Wikidata y recomendaciones Gemini/Groq con clave propia sólo en memoria y consentimiento sobre el contexto enviado. Guardar música, un enlace o un archivo no infiere una adquisición ni una valoración.

La biblioteca local funciona sin cuenta y permite respaldo/restauración, retirada reversible y uso offline tras prepararse. La web publicada ofrece [cuenta y sincronización opcionales](../docs/SINCRONIZACION_SUPABASE.md), con correo transaccional configurado por el alojamiento. El ZIP genérico se distribuye en modo local; compilar un alojamiento con cuentas requiere su configuración explícita. Las credenciales privadas no se incluyen en el cliente ni en el paquete.

La [validación del recorrido](../docs/VALIDACION_RECORRIDO.md) recoge las comprobaciones técnicas y la aceptación comunicada de escritorio del 28 de octubre. [UX-07 #72](https://github.com/NicoCG32/Auditorium/issues/72) y [la coordinación #60](https://github.com/NicoCG32/Auditorium/issues/60) están completadas. La revisión de uso y las pruebas automáticas mantienen sus límites documentados.

## Desarrollo local

Requisitos: Node.js 24 LTS (24.15.0 o posterior dentro de esa rama) y npm 12.2.x o posterior dentro de la rama 12. La instalación inicial requiere internet para descargar dependencias; ejecutar y compilar la plantilla no requiere claves ni cuentas externas.

Desde la raíz del repositorio:

```sh
npm ci
npm run dev
```

Abre la dirección local que indica Vite en la terminal, normalmente `http://127.0.0.1:5173`. Para detenerlo, pulsa Ctrl+C.

```sh
npm run build
npm run preview
```

`build` comprueba los tipos de la aplicación, configuración y pruebas E2E, y genera los archivos estáticos y la PWA en `dist/`. `preview` permite revisar esa compilación localmente. El service worker se desactiva en desarrollo; usa el origen de preview para probar offline. Los artefactos generados y las dependencias no se versionan.

La pantalla principal consulta la biblioteca guardada en este navegador: búsqueda por título/artista/género/país, filtros de escucha, nota, género y país, ordenación y vistas de cuadrícula/lista. Permite añadir álbumes, revisar coincidencias, consultar su ficha, corregir sus metadatos, guardar escucha, nota, comentario y edición de referencia conjuntamente en [Mi experiencia](../docs/MI_EXPERIENCIA.md). Los géneros pertenecen al álbum y el país de origen a cada artista acreditado. La ficha reúne la lista original y las ediciones con orden propio, pistas compartidas, bonus y variantes. Las notas de pistas se comparten entre sus apariciones; una variante tiene nota propia y la del álbum no se recalcula. Incluye portada opcional, protección de borradores y errores con reintento. La colección registra copias independientes y compras digitales, con eliminación confirmada. Los deseos apuntan a un formato o edición y una compra coincidente ofrece cumplirlos mediante una acción explícita. Permite retirar álbumes sin perder datos y restaurar la misma entrada desde «Álbumes retirados». Quitar la nota prepara un borrador y se confirma al guardar la experiencia; eliminar ejemplares requiere confirmación. «Respaldos» descarga la biblioteca completa y restaura datos e identidad desde un JSON validado, únicamente en un destino vacío.

«Aplicación y almacenamiento» informa cuándo se puede reabrir sin conexión, ofrece instalación donde se admita y permite solicitar protección del almacenamiento. Una nueva versión espera al cierre de todas las ventanas, conservando la biblioteca y los borradores de ventanas abiertas. Las portadas por URL y los enlaces externos requieren red. Una portada JPEG/PNG local validada de hasta 2 MiB se conserva con el álbum y el respaldo y puede verse offline. El navegador puede eliminar datos locales; guarda respaldos fuera del dispositivo. Consulta los [alcances y límites de la PWA](../docs/PWA_OFFLINE.md).

## Verificaciones

Para habilitar Supabase durante el desarrollo, copia `.env.example` a `.env.local`, configura la URL y clave publishable del proyecto y sigue la [guía de instalación](../docs/SINCRONIZACION_SUPABASE.md#instalación-y-operación). Nunca incluyas claves secret o service_role en el cliente. La biblioteca local no requiere esta configuración.

```sh
npm run check
```

Este comando comprueba formato, lint, tipos, pruebas y build, y se detiene ante el primer fallo. También se pueden ejecutar por separado:

| Comando                | Comprobación                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run format:check` | Formato Prettier, sin modificar archivos                  |
| `npm run lint`         | Reglas de TypeScript y React, sin advertencias permitidas |
| `npm run typecheck`    | Tipos de aplicación, pruebas y configuración              |
| `npm run test`         | Pruebas Vitest en una sola ejecución                      |
| `npm run build`        | Tipos y compilación de producción                         |

`npm run format` aplica el formato y `npm run test:watch` mantiene las pruebas activas durante el desarrollo. Las pruebas usan Testing Library y jsdom para la interfaz y fake-indexeddb para persistencia, con datos ficticios y limpieza después de cada caso.

TypeScript se fija en 6.0.3 para respetar el [rango compatible de typescript-eslint](https://typescript-eslint.io/users/dependency-versions/). Se mantienen todas las opciones estrictas.

Para comprobar la aceptación en Chromium, Firefox y WebKit aislados, ejecuta `npx playwright install chromium firefox webkit` una vez y después `npm run test:e2e`. El recorrido principal, las auditorías axe, teclado y pantallas se ejecutan en los tres motores. Las pruebas de offline, actualizaciones y reinicio de proceso se ejecutan en Chromium. Los servidores aislados ocupan `127.0.0.1:4178` para raíz y `127.0.0.1:4179` para Pages y `127.0.0.1:4180` para el servicio ficticio de cuentas; cada perfil compila dos versiones de producción y usa exclusivamente datos ficticios. No modifica la biblioteca del navegador habitual. Consulta la [matriz de validación y sus límites](../docs/VALIDACION_MVP.md).

GitHub Actions ejecuta `npm ci`, `npm run check`, prepara los tres motores y ejecuta `npm run test:e2e` en las PR y en cambios de `main`, con Node 24 y npm 12.2.0, usando un runner Linux estándar. Tras pasar las verificaciones, `npm run package` prepara un paquete estático con documentación, changelog, avisos de dependencias e inventario SHA-256, disponible como artefacto del run durante siete días. Las releases conservan el ZIP y su checksum junto al tag validado. Los pushes validados de `main` también compilan `build:pages` y publican exclusivamente `dist/` en GitHub Pages. Consulta las guías de [entrega](../docs/ENTREGA.md) y [publicación web](../docs/PUBLICACION_WEB.md).

La configuración sigue la [guía de Vite](https://vite.dev/guide/) y separa los proyectos TypeScript de la aplicación y de Node.

## Documentación técnica

El [índice de documentación](../docs/README.md) organiza las referencias vigentes, las guías funcionales y las decisiones de arquitectura, distinguiendo el MVP histórico v1.0.0 de la distribución actual v1.1.0.

- [Arquitectura del sistema](../docs/ARQUITECTURA.md): contexto, componentes, dependencias, transacciones, PWA y distribución.
- [Modelo de dominio](../docs/MODELO_DOMINIO.md): entidades, cardinalidades, reglas, estados y ejemplos ficticios.
- [Modelo de datos](../docs/MODELO_DATOS.md): tablas, claves, índices, migraciones, identidad, concurrencia y respaldos.
- [Navegación y borradores](../docs/NAVEGACION.md): rutas, regreso con contexto y guardado o descarte explícito de cambios.
- [Enlaces personales](../docs/ENLACES_PERSONALES.md): escucha, compra, favorito opcional y guardado coordinado.
- [Biblioteca](../docs/BIBLIOTECA.md): búsqueda, filtros plegables, selecciones activas, tarjetas y vistas.

## Plan y seguimiento

- [Plan de desarrollo](../docs/PLAN_DESARROLLO.md)
- [Backlog y seguimiento en GitHub Projects](https://github.com/users/NicoCG32/projects/4)
- [Hitos de entrega](https://github.com/NicoCG32/Auditorium/milestones)
- [Decisiones de arquitectura](../docs/README.md#decisiones-de-arquitectura)
