# ADR-005: identidad en restauración de respaldo vacío

Estado: aceptada para respaldos locales v1.

## Contexto

Un respaldo incluye entradas personales asociadas a una identidad local. Conservar la identidad nueva del destino mientras se importan esas relaciones produciría propietarios incoherentes o datos invisibles. El núcleo ya impide cambiar identidad mediante mutaciones musicales ordinarias.

## Decisión

La restauración es un caso de uso separado, disponible únicamente cuando todas las colecciones musicales están vacías y metadata solo contiene la identidad inicial. Valida el archivo antes de escribir y comprueba identidad/vacío del destino dentro de la transacción.

Se adopta la identidad respaldada con todos los registros en una operación atómica. Se preservan IDs, propietarios, fechas y relaciones, incluyendo entradas retiradas y sus datos. No se fusionan bibliotecas ni se regeneran IDs. Las mutaciones musicales conservan la prohibición de cambiar identidad.

El contrato JSON comienza en schemaVersion 1 y se versiona independientemente del esquema físico v3. Versiones no soportadas se rechazan; el límite de lectura y exportación es 20 MiB UTF-8.

## Consecuencias

Una biblioteca trasladada conserva sus relaciones y puede editarse con la identidad original. Cuota o aborto revierten también metadata. Cambios concurrentes del destino invalidan la preparación y requieren revisar el estado antes de confirmar de nuevo. Seleccionar, cancelar o validar un archivo no escribe datos.

Este caso no repara automáticamente bases corruptas, no sustituye datos existentes y no cambia identidades de cuentas remotas. Merge y sincronización requieren políticas propias en sus respectivos hitos.

Ver [contrato de respaldo](../RESPALDOS_JSON.md) y [persistencia local](../PERSISTENCIA_LOCAL.md).
