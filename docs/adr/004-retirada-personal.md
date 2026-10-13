# ADR-004: retirada reversible de álbumes personales

Estado: aceptada para el núcleo local.

## Contexto

Quitar un álbum debe explicar qué ocurre con escucha, notas, valoraciones, deseos y ejemplares. Las entradas ya admiten `deletedAt`, un índice de unicidad activa y datos personales históricos. Borrar esas relaciones obligaría a recuperar sus datos mediante un respaldo, cuyo flujo pertenece a otro hito.

## Decisión

La operación de biblioteca es una retirada reversible, confirmada, que marca la entrada y conserva todos sus datos dependientes. «Álbumes retirados» permite restaurar la misma entrada. No se elimina el catálogo ni se fusiona la retirada con otra entrada activa del mismo álbum.

La confirmación captura una referencia del conjunto personal; la transacción la comprueba para evitar aplicar consecuencias a datos que cambiaron. Retirar/restaurar solo cambia la fila personal y su índice derivado. Se mantiene el esquema v3.

Las eliminaciones individuales de ejemplares y ratings conservan su alcance: requieren confirmación y explican qué se pierde. Las notas de borrador se aplican únicamente al guardar. El borrado de ediciones sigue sin interfaz y las referencias actuales deben permanecer válidas.

## Consecuencias

El usuario puede recuperar el álbum sin perder datos ni cambiar sus IDs. Las entradas retiradas siguen ocupando espacio y conservan referencias a catálogo; no se incorpora purga permanente. Una alta nueva y una entrada retirada pueden coexistir, pero restaurar requiere que no haya otra activa. No se transfieren sus datos silenciosamente.

Esta retirada no sustituye un respaldo. Los [respaldos JSON](../RESPALDOS_JSON.md) incluyen entradas retiradas y todas sus relaciones. La sincronización y su política de marcadores/conflictos se resolverán en su hito, sin añadir ahora un protocolo remoto.

Ver [contrato de eliminaciones](../ELIMINACIONES_PERSONALES.md) y [persistencia](../PERSISTENCIA_LOCAL.md).
