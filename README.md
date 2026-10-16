# Auditorium

Auditórium es una biblioteca musical personal, multiplataforma e híbrida, donde una persona registra qué álbumes conoce, escucha, posee, califica y desea adquirir, independientemente del formato y de las plataformas de streaming.

El MVP local `1.0.0` completa las Fases 0–4: persistencia, búsqueda, registro manual con revisión de duplicados, ficha, valoración del álbum, escucha y notas personales. La colección incluye listas originales, ediciones, calificaciones de pistas, ejemplares físicos o compras digitales y deseos por formato o edición. Incorpora retirada reversible, confirmaciones, respaldos JSON con restauración en biblioteca vacía y PWA para reabrir y gestionar la biblioteca sin conexión tras prepararse. Las migraciones y la recuperación se verifican también con reinicio de un navegador real. Las cuentas y la sincronización son etapas posteriores.

La [release v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0) distribuye el paquete estático y su checksum SHA-256. Consulta la [guía de uso y entrega](docs/ENTREGA_MVP.md) y el [changelog](CHANGELOG.md).

La [web/PWA de Auditorium](https://nicocg32.github.io/Auditorium/) se publica mediante GitHub Pages desde revisiones validadas de `main`. Los datos se guardan en tu navegador; la [guía de publicación web](docs/PUBLICACION_WEB.md) explica instalación, traslado por respaldo y límites del origen.

«Apariencia» ofrece temas oscuro y pergamino, ambientación desactivable y una vista previa temporal de una foto local. Las preferencias visuales son independientes de la colección y sus respaldos. Consulta el [sistema de diseño y su validación](docs/DISENO_BASE.md).

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

La pantalla principal consulta la biblioteca guardada en este navegador: búsqueda por título/artista, filtros de escucha y nota, ordenación y vistas de cuadrícula/lista. Permite añadir álbumes, revisar coincidencias, consultar su ficha, valorar y editar escucha y comentarios de forma independiente. La ficha reúne la lista original y las ediciones con orden propio, pistas compartidas, bonus y variantes. Las notas de pistas se comparten entre sus apariciones; una variante tiene nota propia y la del álbum no se recalcula. Incluye portada opcional, protección de borradores y errores con reintento. La colección registra copias independientes y compras digitales, con eliminación confirmada. Los deseos apuntan a un formato o edición y una compra coincidente ofrece cumplirlos mediante una acción explícita. Permite retirar álbumes sin perder datos y restaurar la misma entrada desde «Álbumes retirados». Quitar valoraciones y ejemplares requiere confirmar sus consecuencias. «Respaldos» descarga la biblioteca completa y restaura datos e identidad desde un JSON validado, únicamente en un destino vacío.

«Aplicación y almacenamiento» informa cuándo se puede reabrir sin conexión, ofrece instalación donde se admita y permite solicitar protección del almacenamiento. Una nueva versión espera al cierre de todas las ventanas, conservando la biblioteca y los borradores de ventanas abiertas. Las portadas y enlaces externos requieren red. El navegador puede eliminar datos locales; guarda respaldos fuera del dispositivo. Consulta los [alcances y límites de la PWA](docs/PWA_OFFLINE.md).

## Verificaciones

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

Para comprobar la aceptación en Chromium, Firefox y WebKit aislados, ejecuta `npx playwright install chromium firefox webkit` una vez y después `npm run test:e2e`. El recorrido principal, las auditorías axe, teclado y pantallas se ejecutan en los tres motores. Las pruebas de offline, actualizaciones y reinicio de proceso se ejecutan en Chromium. Los servidores aislados ocupan `127.0.0.1:4178` para raíz y `127.0.0.1:4179` para Pages; cada perfil compila dos versiones de producción y usa exclusivamente datos ficticios. No modifica la biblioteca del navegador habitual. Consulta la [matriz de validación y sus límites](docs/VALIDACION_MVP.md).

GitHub Actions ejecuta `npm ci`, `npm run check`, prepara los tres motores y ejecuta `npm run test:e2e` en las PR y en cambios de `main`, con Node 24 y npm 12.2.0, usando un runner Linux estándar. Tras pasar las verificaciones, `npm run package` prepara un paquete estático con documentación, changelog, avisos de dependencias e inventario SHA-256, disponible como artefacto del run durante siete días. Las releases conservan el ZIP y su checksum junto al tag validado. Los pushes validados de `main` también compilan `build:pages` y publican exclusivamente `dist/` en GitHub Pages. Consulta las guías de [entrega](docs/ENTREGA_MVP.md) y [publicación web](docs/PUBLICACION_WEB.md).

La configuración sigue la [guía de Vite](https://vite.dev/guide/) y separa los proyectos TypeScript de la aplicación y de Node.

## Documentación técnica

El [índice de documentación](docs/README.md) organiza las referencias del MVP v1.0.0, las guías funcionales y las decisiones de arquitectura.

- [Arquitectura del sistema](docs/ARQUITECTURA.md): contexto, componentes, dependencias, transacciones, PWA y distribución.
- [Modelo de dominio](docs/MODELO_DOMINIO.md): entidades, cardinalidades, reglas, estados y ejemplos ficticios.
- [Modelo de datos](docs/MODELO_DATOS.md): tablas, claves, índices, migraciones, identidad, concurrencia y respaldos.

## Plan y seguimiento

- [Plan de desarrollo](docs/PLAN_DESARROLLO.md)
- [Backlog y seguimiento en GitHub Projects](https://github.com/users/NicoCG32/projects/4)
- [Hitos de entrega](https://github.com/NicoCG32/Auditorium/milestones)
- [Decisiones de arquitectura](docs/README.md#decisiones-de-arquitectura)
