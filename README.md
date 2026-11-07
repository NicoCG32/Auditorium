<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="branding/banners/auditorium-banner-oscuro.png" />
  <img src="branding/banners/auditorium-banner-claro.png" alt="Auditorium: identidad de la fonoteca digital" width="100%" />
</picture>

# Auditorium

**Tu música. Tu criterio. Tu colección.**

[![React 19](https://img.shields.io/badge/React-19-263244?logo=react&logoColor=white)](package.json)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-263244?logo=typescript&logoColor=white)](package.json)
[![Dexie 4](https://img.shields.io/badge/Dexie-4-8D343A)](package.json)
[![Web / PWA](https://img.shields.io/badge/Plataforma-Web%20%2F%20PWA-8D343A)](docs/tecnica/01-arquitectura.md)
[![PolyForm NC](https://img.shields.io/badge/Licencia-PolyForm%20NC-596273)](LICENSE)

[**Abrir la aplicación**](https://nicocg32.github.io/Auditorium/) · [**Documentación**](docs/README.md) · [**Descargas del proyecto**](https://github.com/NicoCG32/Auditorium/releases) · [**Código fuente**](https://github.com/NicoCG32/Auditorium)

</div>

## Resumen ejecutivo

Auditorium es una fonoteca digital para organizar álbumes, ediciones, escuchas, valoraciones y adquisiciones en un mismo lugar. Separa el catálogo musical de la experiencia personal y de la colección, para reconocer tanto una obra como las distintas ediciones y copias que tienes.

Funciona como web/PWA y guarda la biblioteca en el navegador, sin exigir una cuenta. Ofrece respaldos JSON y ZIP con audio propio, además de sincronización opcional de metadatos entre dispositivos. La versión publicada es la 1.1.0; los cambios posteriores se describen en el [changelog](CHANGELOG.md).

## Estado real del proyecto

| Nivel | Alcance de esta versión |
| --- | --- |
| ✅ **Implementado** | Fonoteca web/PWA con álbumes, ediciones, colección y experiencia de escucha; persistencia local, importación/respaldo y sincronización **opcional** de metadatos. |
| 🧪 **En validación** | Compatibilidad y recuperación de datos en distintos dispositivos, límites de integración con proveedores externos y experiencia de uso prolongada. |
| 🧭 **Evolución futura** | Ampliaciones descritas en el plan de desarrollo. No debe entenderse que todos los prototipos, proveedores o integraciones opcionales estén configurados para cada instalación. |

<details>
<summary><strong>¿Qué significa cada estado?</strong></summary>

«Implementado» describe algo respaldado por código o una entrega identificable; no garantiza una validación completa. «En validación» necesita pruebas adicionales, y «propuesto» es una aspiración, no una función disponible. Las notas de versión y los documentos especializados detallan los límites concretos.

</details>

## ¿Por qué hice Auditorium?

Quería una fonoteca digital que no me obligara a reducir mi relación con la música a una lista de canciones guardadas en un servicio. Un álbum puede tener distintas ediciones; una edición, distintas pistas; y yo puedo haberlo escuchado, valorado o coleccionado sin que todo eso sea lo mismo.

Esa diferencia fue el punto de partida. Diseñé Auditorium para reunir **el catálogo musical, mi experiencia de escucha y mi colección** sin depender de una cuenta ni de una plataforma de streaming. El vinilo también forma parte de su identidad visual: representa el valor que puede tener una obra completa, tanto en formato físico como digital.

## Qué puedo hacer

- **Catalogar:** registrar artistas, álbumes, ediciones, pistas, géneros y referencias; buscar y filtrar.
- **Llevar mi experiencia:** anotar estados de escucha, comentarios y valoraciones del álbum, de pistas y por género, sin confundir unas con otras.
- **Administrar la colección:** registrar ejemplares físicos, compras digitales y deseos de adquisición.
- **Escuchar o consultar:** abrir enlaces personales, utilizar reproductores externos compatibles o vincular audio propio guardado en el dispositivo.
- **Conservar mis datos:** trabajar localmente y exportar respaldos; optar por una cuenta con sincronización de metadatos cuando la aplicación esté configurada para ello.

Puedes [abrir la web](https://nicocg32.github.io/Auditorium/) o [descargar el paquete web 1.1.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.1.0). La [guía de entrega](docs/ENTREGA.md) explica la instalación como PWA, los respaldos y las actualizaciones.

## Cómo está construida

| Capa                 | Implementación                         | Para qué se usa                                               |
| -------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Interfaz             | React 19, TypeScript 6, Tailwind CSS 4 | Formularios, vistas, experiencia y navegación                 |
| Construcción / PWA   | Vite 8, vite-plugin-pwa                | Compilación, recursos y funcionamiento sin conexión preparado |
| Dominio y validación | TypeScript y Zod 4                     | Identidades, relaciones y reglas de integridad                |
| Persistencia local   | IndexedDB con Dexie 4                  | Catálogo, biblioteca y audio por dispositivo                  |
| Cuenta opcional      | Supabase Auth y PostgreSQL             | Sincronización privada de _snapshots_ sin bytes de audio      |
| Calidad              | Vitest, Testing Library, Playwright    | Pruebas unitarias, de interfaz, navegador y accesibilidad     |

> La biblioteca se guarda en este navegador. Exporta un respaldo antes de cambiar de dispositivo u origen: JSON para metadatos y ZIP completo para incluir el audio propio.

## Empezar desde el código

Requisitos: **Node 24.15+ dentro de la rama 24, o Node 26+**, con **npm 12.2.x**.

```bash
npm ci
npm run dev
```

Vite muestra la dirección local. Para calidad y compilación:

```bash
npm run check
npm run test:e2e
npm run build:pages
```

La biblioteca local funciona sin claves. Para habilitar cuentas y sincronización, consulta la [configuración de Supabase](docs/tecnica/05-integraciones-y-seguridad.md).

## Leer la documentación

| Quiero…                          | Leer                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comprender el origen y uso       | [General](docs/general/01-origen-y-alcance.md) · [Recorrido](docs/general/02-uso-y-limites.md)                                                                          |
| Entender el sistema              | [Arquitectura y diagramas](docs/tecnica/01-arquitectura.md) · [Modelo de dominio](docs/tecnica/02-dominio.md) · [Persistencia](docs/tecnica/03-datos-y-persistencia.md) |
| Contribuir o verificar           | [Proceso](docs/desarrollo/01-proceso-y-decisiones.md) · [Entorno y calidad](docs/desarrollo/02-entorno-y-verificacion.md)                                               |
| Consultar una función específica | [Índice y guías de uso](docs/README.md)                                                                                                                                 |

## Autoría, uso y licencias

Creado por Pablo Guzmán ([NicoCG32](https://github.com/NicoCG32)) como proyecto personal e independiente.

Código y documentación original sujetos a [PolyForm Noncommercial 1.0.0](LICENSE), con [condiciones y créditos](LICENSING.md) y [avisos](NOTICE). Las dependencias y recursos de terceros conservan sus licencias.
