# Entorno, pruebas y entrega

Los comandos de desarrollo y verificación se definen en [`package.json`](../../package.json). El workflow de [calidad](../../.github/workflows/calidad.yml) ejecuta las comprobaciones de integración continua.

## Preparación del entorno

Requisitos declarados:

- Node.js `^24.15.0 || >=26.0.0` y npm `^12.2.0`.
- Repositorio con `package-lock.json`; instalar mediante `npm ci`.
- Navegadores de Playwright preparados cuando se ejecutan pruebas end-to-end.
- Configuración Supabase opcional para compilar la variante conectada.

```bash
npm ci
npm run dev
```

## Matriz de comprobaciones

| Comando                | Qué verifica                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run format:check` | Formato Prettier                                     |
| `npm run lint`         | Reglas ESLint sin advertencias                       |
| `npm run typecheck`    | Tipado de TypeScript                                 |
| `npm test`             | Pruebas Vitest                                       |
| `npm run build`        | Compilación de tipos y build web                     |
| `npm run check`        | Formato, lint, tipos, unitarias y build              |
| `npm run test:e2e`     | Recorridos y accesibilidad con Playwright            |
| `npm run build:pages`  | Build con base `/Auditorium/` para GitHub Pages      |
| `npm run package`      | Build y paquete estático según `scripts/package.mjs` |

El workflow también instala Chromium, Firefox y WebKit, ejecuta pruebas de audio y prototipos aislados, y conserva el paquete generado. Los resultados de cada commit se pueden consultar en [GitHub Actions](https://github.com/NicoCG32/Auditorium/actions).

## Riesgos que deben tener pruebas

| Riesgo                             | Comprobación que importa                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| Duplicar álbum o crédito           | Integridad y resolución de duplicados, con referencias estables |
| Perder una nota al editar otra     | Verificar independencia de nota general, pista y género         |
| Confundir edición con pista        | Pistas compartidas, variante y orden de edición                 |
| Restaurar información incompatible | Versiones, identidad, destino y recuperación después de error   |
| Sincronizar dos modificaciones     | Revisión remota, conflicto y conservación de datos locales      |
| Perder audio                       | Límite, hash, manifiesto, traslado ZIP y asociaciones           |
| Actualización PWA                  | Caché, reapertura y migración de IndexedDB                      |
| Mala experiencia móvil             | Foco, teclado, reflujo y accesibilidad por navegador            |

## Distribución, seguridad y compatibilidad

La web se sirve como sitio estático HTTPS. Un usuario puede instalarla como PWA cuando su navegador lo permite. El paquete generado por `npm run package` es **web estático**, no ejecutable nativo de escritorio ni APK.

Antes de declarar una entrega, conviene comprobar: build limpio en el runtime declarado, artefacto vinculado a commit, flujo de apertura/alta/ficha/respaldo, contraste de tema, acceso sin conexión ya preparado y protección de datos después de actualizar. Si se habilita Supabase, se revisan migraciones y RLS por separado.

**Precaución:** restaurar una base con formato nuevo desde una versión vieja puede no estar soportado; guardar respaldos antes de cambios de origen, perfil o versión. Un rollback de código no equivale a rollback de datos.

[Arquitectura](../tecnica/01-arquitectura.md) · [Estados](../tecnica/04-flujos-y-estados.md)
