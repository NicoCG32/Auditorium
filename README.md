# Auditorium

Auditórium es una biblioteca musical personal, multiplataforma e híbrida, donde una persona registra qué álbumes conoce, escucha, posee, califica y desea adquirir, independientemente del formato y de las plataformas de streaming.

Las Fases 0 y 1 están completadas: base ejecutable, dominio, persistencia local y casos de uso transaccionales. La Fase 2 incorpora consulta, búsqueda, registro manual con revisión de duplicados y valoración del álbum desde su ficha. El MVP previsto será local, con ediciones y ejemplares diferenciados, respaldo JSON y funcionamiento offline tras la primera carga. Las cuentas y la sincronización son etapas posteriores.

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

`build` comprueba los tipos de la aplicación y de la configuración y genera los archivos estáticos en `dist/`. `preview` permite revisar esa compilación localmente. Los artefactos generados y las dependencias no se versionan.

La pantalla principal consulta la biblioteca guardada en este navegador: búsqueda por título/artista, filtros de escucha y nota, ordenación y vistas de cuadrícula/lista. Permite añadir álbumes, revisar coincidencias, consultar su ficha y guardar o quitar una valoración de 1–10 en pasos de 0,5. Incluye metadatos, portada opcional y errores con reintento. La edición de escucha y comentarios corresponde a LIB-04. Los respaldos y la PWA pertenecen a Fase 4.

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

GitHub Actions ejecuta `npm ci` y `npm run check` en las PR y en cambios de `main`, con Node 24 y npm 12.2.0, usando un runner Linux estándar. El flujo no despliega la aplicación.

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
- Decisiones de arquitectura: [MVP local](docs/adr/001-mvp-local.md), [álbum, edición y pista](docs/adr/002-album-edicion-pista.md) y [costo recurrente cero](docs/adr/003-costo-cero.md).
