# 06 — Integraciones y asistencia

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Integraciones y límites de asistencia

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

| Servicio / integración       | Finalidad / ejecución                           | Contrato o límite                                                |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Supabase                     | Cuenta y sincronización opcionales              | No incluye audio personal; configuración y permisos por ambiente |
| Wikidata y enlaces musicales | Referencia y navegación/reproducción oficial    | Revisión humana, condiciones y fallos de terceros                |
| Groq/Gemini                  | Asistencia opcional con clave propia en memoria | No dependencia del modo manual ni escritura automática           |

Si no hay IA generativa implementada, este capítulo no la introduce. Una IA rival de videojuego no es un proveedor LLM. Cuando existe asistencia, documentar entradas enviadas, revisión, esquema, timeout/cancelación y efecto permitido. Los reintentos/fallback deben corresponder al código y al consentimiento; no se agregan a un contrato de intento único para seguir una plantilla.

Las claves de servidor y firma no se incluyen en cliente, informes o archivos de distribución. La disponibilidad, costo y condiciones de los proveedores se verifican para el entorno real. Sin esa comprobación, distinguir integración configurada, declarada y probada.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
