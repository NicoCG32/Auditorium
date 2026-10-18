# ADR-011: cuenta opcional y sincronización privada con Supabase

Estado: aceptada para el incremento SYNC-01. Fecha: 2026-10-18.

## Contexto

Se necesita utilizar la misma biblioteca en varios dispositivos mediante correo y contraseña. El MVP publicado conserva su alcance local. El incremento debe mantener el acceso sin cuenta, las escrituras offline, el presupuesto obligatorio cero y las identidades musicales existentes.

## Decisión

Utilizar Supabase Auth y Postgres en el plan gratuito. Separar la biblioteca sin cuenta y las cachés por proyecto y cuenta. La incorporación de una biblioteca previa es explícita y conserva el original. La cuenta remota tiene un agregado privado versionado, con validación de dominio en el cliente, RLS para lecturas y una RPC que comprueba propietario, operación y revisión para escribir.

El snapshot local durable y el checkpoint de IndexedDB v6 forman la cola de sincronización. El servidor serializa la escritura mediante revisión y bloqueo; el cliente combina tres copias por registros y exige resolución ante cambios incompatibles. Conservar ambas copias antes de aplicar una elección. No usar el reloj del cliente como autoridad ni sobrescritura silenciosa de la última petición.

Mantener tokens en la pestaña y compartir sólo el verificador temporal PKCE entre pestañas del mismo origen. No incorporar contraseñas, sesiones ni claves privilegiadas a la biblioteca o a los respaldos. El endpoint y la clave publishable son configuración pública; permisos y RLS son la frontera de acceso.

## Consecuencias

GitHub Pages puede servir la aplicación sin un servidor propio. El modo local conserva su independencia de Supabase. El documento completo simplifica la atomicidad entre datos relacionados, a cambio de transferencia y almacenamiento mayores; el máximo es 20 MiB. La normalización y un protocolo incremental se evaluarán si crece el uso.

Confirmación y recuperación públicas necesitan un SMTP configurado; el servicio incluido sólo permite direcciones del equipo. Su habilitación se sigue como tarea separada. No se activan planes de pago, correo comercial ni almacenamiento de audio en este incremento. La sincronización no sustituye respaldos externos, cifrado del dispositivo ni un historial recuperable del servidor.

Ver [contrato, diagramas y validación](../SINCRONIZACION_SUPABASE.md) y [SYNC-01](https://github.com/NicoCG32/Auditorium/issues/25).
