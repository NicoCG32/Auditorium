# 08 — Salidas y entregables

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Salidas, respaldo e informes

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

JSON7 conserva metadatos sin audio; ZIP1 incluye manifiesto y archivos locales. Un paquete estático de release contiene la aplicación, no la biblioteca privada. Restauración, migración y cambio de origen se describen en las guías específicas.

### Separación de entregables

- **Resultado de uso:** información/experiencia que obtiene la persona al completar el recorrido.
- **Datos o respaldo:** sólo los formatos explícitamente implementados y su contrato de restauración.
- **Distribución:** aplicación, APK, ZIP o firmware, con fuente y versión; no incluye datos privados por defecto.
- **Documentación académica:** informes/anexos históricos, cuando el origen formativo aplica; se catalogan en su cuarto nivel, sin reescribirlos como especificación vigente.

Cuando un informe representa una decisión calculada, identificar resultados/datos de origen y sus versiones. Si la exportación recalcula por diseño, declararlo; no afirmar inmutabilidad inexistente. Para un proyecto sin exportador funcional, este texto delimita lo que falta y no lo presenta como disponible.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
