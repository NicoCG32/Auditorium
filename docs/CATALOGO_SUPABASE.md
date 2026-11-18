# Servicio de catálogo en Supabase

La web de Auditorium consulta MusicBrainz mediante la función `musicbrainz` del proyecto Supabase existente. No hace falta iniciar sesión para buscar artistas, obras, ediciones o pistas. Elegir e incorporar datos sigue siendo una acción explícita en la biblioteca local.

## Recorrido y límites

El navegador envía la consulta y la clave publicable del proyecto a `/functions/v1/musicbrainz`. La función valida origen, método, clave y parámetros. Sólo admite los destinos MusicBrainz fijados en `request.mjs`; no reenvía cookies, sesiones ni encabezados del navegador al proveedor.

Todas las instancias comparten una cola y caché privadas en PostgreSQL. Una concesión temporal permite una consulta externa a la vez y deja al menos 1,1 segundos desde su finalización hasta la siguiente. La concesión caduca en 30 segundos si una instancia desaparece. La cola admite 32 solicitudes y elimina las pendientes caducadas tras 45 segundos. El tiempo total de una petición está limitado a 45 segundos y la consulta al proveedor a 15 segundos.

La caché admite 128 respuestas, 16 MiB en conjunto y seis horas de vigencia; cada respuesta JSON está limitada a 2 MiB. Se guardan únicamente respuestas públicas y una huella de su URL. Las tablas no guardan texto de búsqueda, IP, usuarios ni datos de la biblioteca. Los registros operativos del alojamiento y MusicBrainz tienen sus propias condiciones.

El alojamiento puede compartir IP de salida con otros servicios. La coordinación cubre Auditorium; MusicBrainz puede limitar también ese tráfico compartido. Los errores temporales muestran una opción de reintento y no se guardan como resultados vacíos. El plan Free de Supabase puede pausar proyectos inactivos; no se añade una tarea para mantenerlo despierto ni un plan de pago.

## Desplegar otra instalación

1. Aplica las migraciones en orden. `20261118022008_musicbrainz_shared_gateway.sql` crea las tablas privadas y las dos RPC de coordinación. Si habilitas cuentas, incluye también las migraciones de snapshots JSON8/9.
2. Ejecuta `supabase/tests/musicbrainz_gateway.sql` en el proyecto antes de servir tráfico. Prueba permisos, cola, caducidad, caché, concesiones y recuperación dentro de una transacción que revierte sus datos ficticios.
3. Despliega `supabase/functions/musicbrainz/index.mjs` y sus tres dependencias relativas. La función comprueba la clave publicable en su cuerpo, por eso se despliega con `verify_jwt: false`. El cliente no envía un JWT personal.
4. El runtime aporta `SUPABASE_URL`, las claves publicables y la clave de servidor. `SUPABASE_PUBLISHABLE_KEYS` y `SUPABASE_SECRET_KEYS` admiten el mapa de claves de la plataforma; se conservan las alternativas heredadas del runtime. `CATALOG_PUBLISHABLE_KEY` permite identificar otra clave pública del mismo proyecto. La clave de servidor sólo se usa dentro de la función para las dos RPC de coordinación.
5. Configura `CATALOG_ALLOWED_ORIGINS` si utilizas otro dominio; admite una lista separada por comas. El valor predeterminado es `https://nicocg32.github.io`.
6. Compila con `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_MUSICBRAINZ_PROXY_URL=https://tu-proyecto.supabase.co/functions/v1/musicbrainz`. En Pages son las variables de repositorio `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `MUSICBRAINZ_PROXY_URL`.

La clave publicable sólo se adjunta cuando el catálogo usa exactamente la ruta anterior en el mismo origen HTTPS del proyecto configurado. Otros hosts de catálogo no la reciben. Una clave privilegiada nunca debe ponerse en variables `VITE_`, GitHub o archivos del cliente.

Las RPC son `SECURITY INVOKER`, con búsqueda de esquema vacía y ejecución exclusiva de `service_role`. Las tablas están en `auditorium_private`, con RLS y sin políticas ni permisos para clientes. La ausencia de políticas es deliberada: ningún cliente debe leerlas o escribirlas. La biblioteca privada conserva su aislamiento y sus RPC de sincronización independientes.

## Verificación

`npm run check` ejecuta las pruebas del protocolo Node y del coordinador Edge, además de la aplicación. Las pruebas SQL verifican los límites reales de PostgreSQL. Antes de publicar, comprueba también preflight CORS, rechazo de claves y orígenes ajenos, búsqueda real, discografía, ediciones y pistas. Las pruebas ficticias no acreditan disponibilidad del proveedor.

El 17 de noviembre de 2026 se verificaron las migraciones y pruebas SQL en el proyecto existente, con rollback de los datos ficticios. El servicio HTTPS devolvió Opeth, 75 obras, 21 ediciones de Blackwater Park y una edición CD con ocho pistas; una consulta repetida utilizó la caché. La biblioteca existente no se utiliza en estas comprobaciones.

Fuentes: [claves de Supabase](https://supabase.com/docs/guides/api/api-keys), [secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets), [autenticación de funciones](https://supabase.com/docs/guides/functions/auth) y [límites de MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
