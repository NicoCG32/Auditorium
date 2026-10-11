# ADR-003 — Costo recurrente obligatorio de USD 0

Estado: aceptada para el MVP.
Fecha: 2026-10-11.

## Contexto

La biblioteca debe poder desarrollarse, compilarse y utilizarse localmente con software gratuito, sin activar facturación ni depender de créditos promocionales o pruebas temporales.

## Decisión

El núcleo del MVP usará herramientas gratuitas y funcionará sin servicios remotos necesarios para guardar o consultar datos. No habilitar proveedores facturables, tarjetas o suscripciones para completar sus funciones principales.

Un despliegue estático opcional se evaluará como un hito separado, verificando las condiciones vigentes de un plan gratuito antes de activarlo. El dominio propio y la infraestructura de crecimiento no son requisitos del MVP.

## Consecuencias

- Diferenciar la licencia del software de las cuotas de un proveedor. Un plan gratuito puede cambiar; el núcleo local debe continuar funcionando.
- Revisar costos, licencias, límites y derechos antes de cada integración futura.
- GitHub Actions usa un runner hospedado estándar de Linux para este repositorio público, sin subir artefactos. No cambiar a runners grandes ni ampliar límites de almacenamiento facturable.
- La implementación actual no despliega ni activa servicios de datos externos.

Referencia de la configuración actual: [facturación de GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
