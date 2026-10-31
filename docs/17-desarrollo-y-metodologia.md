# 17 — Etapas y metodología

## Desarrollo del proyecto: etapas y método

Desarrollo Auditorium por capacidades completas: defino el comportamiento, lo llevo al dominio y a la interfaz, y compruebo que se pueda usar sin comprometer la biblioteca existente. Las versiones 1.0.0 y 1.1.0 reúnen esos incrementos; el empaquetado de escritorio y Android tiene su propio recorrido.

### Etapas del proyecto

| Etapa                       | Alcance                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| Base local y dominio        | MVP y release 1.0.0 documentados                                               |
| Experiencia, audio y cuenta | Incrementos integrados en 1.1.0; formatos vigentes diferenciados               |
| Entrega                     | Tag y guía 1.1.0; contrastar CI y artefacto del commit                         |
| Siguiente decisión          | Validación móvil física, tamaños grandes y distribución nativa según prioridad |

### Ciclo de trabajo y decisión

1. Parto de una tarea de la biblioteca, como registrar una edición o restaurar un respaldo.
2. Reviso cómo afecta al catálogo, a la experiencia personal y a las copias que ya existen.
3. Implemento el cambio y pruebo tanto el recorrido habitual como una interrupción o un dato incompatible.
4. Lo integro cuando puedo explicar su uso y conservar la información anterior.

### Cierre y continuidad

Mi siguiente paso es comprobar archivos, audio y recuperación en las plataformas adicionales. Conservo una guía de entrega por versión para que instalar o actualizar la aplicación sea tan claro como usarla.

[Justificación y próximos pasos](15-escalabilidad-y-nuevos-mercados.md) · [Estimaciones comerciales y operación](18-analisis-economico-clp-usd.md).

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
