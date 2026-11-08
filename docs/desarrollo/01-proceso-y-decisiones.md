# Proceso de desarrollo y decisiones

## Autoría y forma de trabajo

Desarrollo Auditorium como **proyecto personal e independiente**. Soy **el único participante humano** y utilizo herramientas de IA como apoyo para iterar, bajo mis instrucciones, decisiones y revisión. No hubo un equipo humano adicional. Trabajo por capacidades completas: defino el comportamiento, reviso su efecto en los datos, lo llevo a la interfaz y compruebo que conserve la biblioteca existente.

## Cómo llegó Auditorium a este punto

No comencé por intentar integrar todos los servicios musicales posibles. Lo fundamental fue definir qué debía ser un álbum en mi sistema, qué representaba una edición y cómo guardar una experiencia personal sin confundirla con el catálogo. A partir de esa separación, las demás funciones podían crecer sin obligarme a rehacer cada registro.

El desarrollo se organiza en estos hitos:

| Hito                               | Evidencia                                                         | Resultado documentado                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **MVP local v1.0.0** — 14 oct 2026 | `CHANGELOG.md`, guías de MVP                                      | Registro manual, catálogo, experiencia, copias, deseos, respaldo, PWA y pruebas                                             |
| **v1.1.0** — 29 oct 2026           | `CHANGELOG.md`, `package.json`                                    | Navegación consolidada, edición, audio local, reproducción desde enlaces, cuenta opcional, clasificación y notas por género |
| **Trabajo sin publicar**           | Sección «Sin publicar» de `CHANGELOG.md`; archivos de importación | Importación aditiva y catálogo musical JSON; existe código y pruebas, pero su estado de release debe comprobarse            |

Las notas de cada versión están en el [changelog](../../CHANGELOG.md).

## Decisiones que atraviesan el diseño

1. **La biblioteca local es el centro.** Puedo registrar y consultar sin depender de Supabase, Wikidata ni un modelo de IA.
2. **Catálogo y datos personales son distintos.** Esto permite reutilizar la identidad de una obra sin hacer que una copia o una nota la definan.
3. **Los cambios conservan los datos anteriores.** Valido relaciones, versiones, restauraciones y conflictos antes de guardar.
4. **Los archivos propios se conservan por dispositivo.** Se transfieren con un ZIP completo, no mediante la sincronización del JSON.
5. **Las integraciones requieren revisión.** Los datos de un proveedor se muestran antes de incorporarlos al catálogo.
6. **La interfaz debe reflejar cómo busco y organizo música.** El diseño visual tiene identidad, pero los formularios y controles siguen siendo herramientas de uso cotidiano.

Las [ADR](../adr/) conservan las decisiones de arquitectura y el contexto en que se tomaron.

## Documentación de los cambios

Cuando una capacidad se integra, actualizo primero su comportamiento y contrato: qué datos afecta, qué sucede si falla, qué se guarda y cómo recuperarlo. Luego reviso el diagrama correspondiente y el recorrido de usuario. Si una investigación no ha terminado en código distribuido, la dejo señalada como propuesta o trabajo sin publicar.

[Calidad y entrega](02-entorno-y-verificacion.md) · [Próximas decisiones](03-evolucion-y-pendientes.md)
