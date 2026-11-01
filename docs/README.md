# Documentación de Auditorium

<p align="center"><img src="../branding/logos/auditorium-monograma-vinilo.png" alt="Monograma de vinilo de Auditorium" width="110" /></p>

Aquí encontrarás el origen de Auditorium, las guías de uso y la documentación para entender y mantener la aplicación.

## Tres áreas de lectura

| Área           | Contenido                                                                 | Lectura                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **General**    | Motivación, propósito, experiencia, diseño y límites                      | [Origen](general/01-origen-y-alcance.md) · [Uso](general/02-uso-y-limites.md) · [Identidad](general/03-diseno-e-identidad.md)                                                                                                                              |
| **Técnica**    | Arquitectura, diagramas, dominio, bases de datos, estados e integraciones | [Arquitectura](tecnica/01-arquitectura.md) · [Dominio](tecnica/02-dominio.md) · [Persistencia](tecnica/03-datos-y-persistencia.md) · [Flujos y estados](tecnica/04-flujos-y-estados.md) · [Servicios y seguridad](tecnica/05-integraciones-y-seguridad.md) |
| **Desarrollo** | Decisiones, cambios, reproducción, pruebas y próximos pasos               | [Proceso](desarrollo/01-proceso-y-decisiones.md) · [Verificación](desarrollo/02-entorno-y-verificacion.md) · [Evolución](desarrollo/03-evolucion-y-pendientes.md)                                                                                          |

## Qué ruta seguir

- **Para conocer Auditorium:** origen → uso → identidad visual.
- **Para evaluar sus decisiones técnicas:** arquitectura → dominio → persistencia → flujos/estados → integraciones.
- **Para mantenerlo:** entorno y pruebas → decisiones → evolución.

## Diagramas y nivel de detalle

Los diagramas Mermaid se pueden consultar en GitHub y se agrupan por responsabilidad:

| Nivel o aspecto                                          | Ubicación                                                |
| -------------------------------------------------------- | -------------------------------------------------------- |
| Contexto, contenedores, componentes y despliegue         | [Arquitectura](tecnica/01-arquitectura.md)               |
| Relaciones de catálogo y biblioteca                      | [Dominio](tecnica/02-dominio.md)                         |
| Almacenes IndexedDB y esquema remoto                     | [Datos](tecnica/03-datos-y-persistencia.md)              |
| Recorridos, transacciones, respaldo y máquinas de estado | [Flujos](tecnica/04-flujos-y-estados.md)                 |
| Interacciones con servicios opcionales                   | [Integraciones](tecnica/05-integraciones-y-seguridad.md) |

## Guías de consulta

Estas guías detallan el comportamiento de cada función y sus límites.

| Consulta específica                 | Referencias                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca, experiencia y colección | [Biblioteca](BIBLIOTECA.md) · [Mi experiencia](MI_EXPERIENCIA.md) · [Mi colección](MI_COLECCION.md) · [Notas por género](VALORACIONES_POR_GENERO.md)                    |
| Instalación y conservación de datos | [Entrega](ENTREGA.md) · [PWA y offline](PWA_OFFLINE.md) · [Respaldos JSON](RESPALDOS_JSON.md) · [Importación JSON](IMPORTACION_JSON.md) · [Audio local](AUDIO_LOCAL.md) |
| Servicios opcionales                | [Cuenta y sincronización](SINCRONIZACION_SUPABASE.md) · [Metadatos](METADATOS_EXTERNOS.md) · [Reproducción](REPRODUCCION.md)                                            |

## Decisiones de arquitectura

Las [ADR](adr/) conservan las decisiones y su contexto histórico. Incluyen el [MVP local](adr/001-mvp-local.md), la [separación álbum/edición/pista](adr/002-album-edicion-pista.md), la [sincronización opcional](adr/011-supabase-sincronizacion.md), el [audio local y su respaldo](adr/012-audio-local-respaldo.md) y las [valoraciones por género](adr/013-valoraciones-por-genero.md). Para el comportamiento vigente, consulta también el código y las guías correspondientes.
