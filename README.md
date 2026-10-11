# Auditorium
Auditórium es una biblioteca musical personal, multiplataforma e híbrida, donde una persona registra qué álbumes conoce, escucha, posee, califica y desea adquirir, independientemente del formato y de las plataformas de streaming.

El proyecto está en Fase 0. Actualmente incluye una plantilla mínima ejecutable con React, Vite y TypeScript estricto. El MVP previsto será local, con registro manual, ediciones y ejemplares diferenciados, respaldo JSON y funcionamiento offline tras la primera carga. Las cuentas y la sincronización son etapas posteriores.

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

Por ahora hay una pantalla de bienvenida sin funciones de biblioteca. Las herramientas de lint y pruebas corresponden a la siguiente tarea; el diseño base y los tokens, a la posterior. El almacenamiento local, los respaldos y la PWA se incorporarán en sus fases respectivas.

La configuración sigue la [guía de Vite](https://vite.dev/guide/) y separa los proyectos TypeScript de la aplicación y de Node.

## Plan y seguimiento

- [Plan de desarrollo](docs/PLAN_DESARROLLO.md)
- [Backlog y seguimiento en GitHub Projects](https://github.com/users/NicoCG32/projects/4)
- [Hitos de entrega](https://github.com/NicoCG32/Auditorium/milestones)
