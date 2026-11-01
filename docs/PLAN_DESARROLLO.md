# Plan de desarrollo de Auditorium

## Objetivo del producto

Mantener una biblioteca musical personal que permita registrar álbumes, ediciones, escuchas, valoraciones, adquisiciones y deseos de compra. El uso local funciona sin cuenta; los servicios externos son opcionales.

## Método de trabajo

El desarrollo avanza por capacidades completas: comportamiento, reglas de dominio, persistencia, interfaz y pruebas. Cada cambio debe conservar la identidad de los registros y la compatibilidad con bibliotecas y respaldos anteriores.

El [proceso de desarrollo](desarrollo/01-proceso-y-decisiones.md) explica las decisiones generales. La [guía de verificación](desarrollo/02-entorno-y-verificacion.md) reúne los comandos y criterios técnicos.

## Fuente de seguimiento

Las [issues](https://github.com/NicoCG32/Auditorium/issues) detallan alcance, dependencias y criterios de aceptación. El [Project](https://github.com/users/NicoCG32/projects/4) organiza el trabajo y el [changelog](../CHANGELOG.md) distingue las releases de los cambios posteriores.

## Roadmap

| Etapa                       | Resultado                                                                                          | Referencias                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Base local y MVP 1.0.0      | Catálogo, identidad, experiencia, ejemplares, deseos, respaldo JSON y PWA                          | [Entrega del MVP](ENTREGA_MVP.md) · [Validación](VALIDACION_MVP.md)                                  |
| Cuenta opcional             | Autenticación, sincronización de metadatos, conflictos y recuperación de acceso                    | [Sincronización](SINCRONIZACION_SUPABASE.md) · [ADR-011](adr/011-supabase-sincronizacion.md)         |
| Experiencia y colección     | Navegación, edición, enlaces, clasificación, referencia de edición y organización de adquisiciones | [Mi experiencia](MI_EXPERIENCIA.md) · [Mi colección](MI_COLECCION.md)                                |
| Reproducción y archivos     | Reproductores externos, audio por dispositivo y respaldo completo ZIP                              | [Reproducción](REPRODUCCION.md) · [Audio local](AUDIO_LOCAL.md)                                      |
| Notas por género            | Valoraciones independientes, edición conjunta y comparación contextual                             | [Valoraciones por género](VALORACIONES_POR_GENERO.md)                                                |
| Release 1.1.0               | Consolidación del recorrido y distribución web/PWA                                                 | [Entrega](ENTREGA.md) · [Validación del recorrido](VALIDACION_RECORRIDO.md)                          |
| Cambios posteriores a 1.1.0 | Importación aditiva y catálogo JSON, registrados en «Sin publicar»                                 | [Importación](IMPORTACION_JSON.md) · [DATA-01 #83](https://github.com/NicoCG32/Auditorium/issues/83) |

La base vigente usa IndexedDB 11, snapshot JSON 7 y ZIP 1. Las [migraciones](MIGRACIONES_RECUPERACION.md) y los lectores históricos mantienen la compatibilidad de los datos.

## Próximas líneas de trabajo

- Comprobar rendimiento y recuperación con bibliotecas grandes y almacenamiento limitado.
- Ampliar las pruebas físicas en dispositivos móviles.
- Evaluar el empaquetado de escritorio y Android, con pruebas de instalación, actualización y traslado de datos propias de cada plataforma.

El [capítulo de evolución](desarrollo/03-evolucion-y-pendientes.md) distingue estas líneas de las funciones disponibles.

## Definición de terminado

Una capacidad está lista para integrar cuando:

1. Resuelve el recorrido descrito en la tarea y contempla errores, cancelación y concurrencia cuando corresponda.
2. Conserva los datos y relaciones existentes, con migraciones y lectores compatibles si cambia un contrato.
3. Supera las comprobaciones pertinentes de formato, tipos, lógica, interfaz y navegador.
4. Incluye documentación de uso, límites y recuperación.
5. Permite vincular la distribución al commit y al resultado de su verificación.

Los cambios documentales se comprueban por contenido, coherencia, enlaces y diagramas. Las investigaciones conservan su alcance y sus resultados por separado de las funciones integradas.
