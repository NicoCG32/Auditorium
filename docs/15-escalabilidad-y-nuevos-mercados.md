# 15 — Justificación, proyección y escalabilidad

## Justificación y proyección

Quiero poder distinguir el álbum que conozco, la edición que me interesa y el ejemplar que tengo. Esa separación da sentido al catálogo y a mis registros personales. También quiero conservar la posibilidad de usar la biblioteca localmente y trasladarla mediante un respaldo.

### Ajuste entre problema y solución

| Necesidad                   | Razón del diseño                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- |
| Dispersión de información   | Un modelo común y búsqueda reúnen registros sin obligar a contratar streaming     |
| Pérdida de datos personales | IndexedDB, JSON versionado y ZIP con audio explicitan portabilidad y recuperación |
| Dependencia de terceros     | Registro manual y funcionamiento local continúan sin cuenta ni IA                 |

Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo.

Para mí, su utilidad se ve en tareas sencillas: encontrar un álbum, reconocer qué edición tengo, retomar una escucha y recuperar la biblioteca sin perder información. Quiero comprobar esas tareas con bibliotecas de distintos tamaños y con otras personas que coleccionen música.

### Qué se puede abstraer y qué no

La separación entre obra, edición y ejemplar puede servir para otras colecciones. El respaldo versionado y la experiencia personal son piezas aprovechables; los metadatos y las reglas de cada tipo de colección necesitan un diseño propio.

### Posibles líneas de evolución

Son caminos que me gustaría explorar después del alcance actual.

- **Cine doméstico:** Películas, ediciones y copias físicas comparten parte de esa estructura; habría que adaptar duración, repartos y formatos.
- **Bibliotecas de videojuegos:** Permitiría distinguir juego, plataforma, edición y copia, con reglas propias para licencias digitales.
- **Coleccionismo editorial:** Libros o cómics requieren autores, tiradas y volúmenes, además de revisar la procedencia de sus metadatos.

### Límites y trade-offs

- Evicción/cuota y cambio de origen del navegador
- Conflictos entre bibliotecas y compatibilidad de restauración
- Términos y disponibilidad de servicios musicales
- Audio o datos locales trasladados incorrectamente al empaquetar

### Prioridad de inversión

| Prioridad | Iniciativa                                                         | Qué quiero conseguir                                         |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Alta      | Validar audio, archivos y restauración en una plataforma adicional | Poder llevar la biblioteca a otro dispositivo con confianza. |
| Media     | Revisar rendimiento con bibliotecas grandes                        | Buscar y editar sin perder fluidez.                          |
| Futura    | Explorar otra clase de colección                                   | Comprobar si el modelo se adapta sin complicar la fonoteca.  |

Las [estimaciones comerciales y de operación](18-analisis-economico-clp-usd.md) permiten conversar sobre estos alcances con referencias para Chile y el extranjero.

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
