# Auditorium

Auditórium es una biblioteca musical personal, multiplataforma e híbrida, donde una persona registra qué álbumes conoce, escucha, posee, califica y desea adquirir, independientemente del formato y de las plataformas de streaming.

Las Fases 0, 1, 2 y 3 están completadas: base ejecutable, dominio, persistencia local, consulta, búsqueda, registro manual con revisión de duplicados, valoración del álbum, escucha y notas personales. La colección incluye listas originales, ediciones, calificaciones de pistas, ejemplares físicos o compras digitales y deseos por formato o edición. La Fase 4 incorpora retirada reversible, confirmaciones, respaldos JSON con restauración en biblioteca vacía y PWA para reabrir y gestionar la biblioteca sin conexión tras prepararse. Las migraciones y la recuperación se verifican también con reinicio de un navegador real. La candidata `1.0.0-rc.1` prepara la validación final y entrega del MVP; el cierre de la fase requiere revisar e integrar MVP-05. Las cuentas y la sincronización son etapas posteriores.

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

Para comprobar la aceptación en Chromium, Firefox y WebKit aislados, ejecuta `npx playwright install chromium firefox webkit` una vez y después `npm run test:e2e`. El recorrido principal, las auditorías axe, teclado y pantallas se ejecutan en los tres motores. Las pruebas de offline, actualizaciones y reinicio de proceso se ejecutan en Chromium. El servidor de prueba ocupa `127.0.0.1:4178`; compila dos versiones de producción y usa exclusivamente datos ficticios. No modifica la biblioteca del navegador habitual. Consulta la [matriz de validación y sus límites](docs/VALIDACION_MVP.md).

GitHub Actions ejecuta `npm ci`, `npm run check`, prepara los tres motores y ejecuta `npm run test:e2e` en las PR y en cambios de `main`, con Node 24 y npm 12.2.0, usando un runner Linux estándar. Tras pasar las verificaciones, `npm run package` prepara una candidata estática con documentación, avisos de dependencias e inventario SHA-256, disponible como artefacto del run durante siete días. El flujo no despliega la aplicación. Consulta la [guía de entrega](docs/ENTREGA_MVP.md).

La configuración sigue la [guía de Vite](https://vite.dev/guide/) y separa los proyectos TypeScript de la aplicación y de Node.

## Plan y seguimiento

- [Plan de desarrollo](docs/PLAN_DESARROLLO.md)
- [Backlog y seguimiento en GitHub Projects](https://github.com/users/NicoCG32/projects/4)
- [Hitos de entrega](https://github.com/NicoCG32/Auditorium/milestones)
- [Diseño base](docs/DISENO_BASE.md)
- [Dominio del catálogo y validación](docs/DOMINIO_CATALOGO.md)
- [Biblioteca personal y calificaciones](docs/DOMINIO_BIBLIOTECA.md)
- [Identidad y persistencia local](docs/PERSISTENCIA_LOCAL.md)
- [Casos de uso y transacciones](docs/CASOS_DE_USO.md)
- [Validación de integridad y persistencia](docs/VALIDACION_PERSISTENCIA.md)
- [Consulta y búsqueda de biblioteca](docs/CONSULTA_BIBLIOTECA.md)
- [Registro manual y revisión de duplicados](docs/REGISTRO_MANUAL.md)
- [Ficha y valoración del álbum](docs/FICHA_ALBUM.md)
- [Escucha y notas personales](docs/EXPERIENCIA_PERSONAL.md)
- [Listas originales y ediciones](docs/LISTAS_EDICIONES.md)
- [Calificaciones de pistas](docs/CALIFICACIONES_PISTAS.md)
- [Ejemplares y migración v2](docs/EJEMPLARES.md)
- [Deseos de compra y migración v3](docs/DESEOS_COMPRA.md)
- [Retirada y eliminaciones personales](docs/ELIMINACIONES_PERSONALES.md)
- [Respaldos JSON y restauración](docs/RESPALDOS_JSON.md)
- [Instalación, uso offline y almacenamiento](docs/PWA_OFFLINE.md)
- [Migraciones, persistencia y recuperación](docs/MIGRACIONES_RECUPERACION.md)
- [Decisión de actualización PWA](docs/adr/006-actualizaciones-pwa.md)
- [Decisión de identidad en respaldo](docs/adr/005-identidad-respaldo.md)
- [Decisión de retirada reversible](docs/adr/004-retirada-personal.md)
- Decisiones de arquitectura: [MVP local](docs/adr/001-mvp-local.md), [álbum, edición y pista](docs/adr/002-album-edicion-pista.md) y [costo recurrente cero](docs/adr/003-costo-cero.md).
