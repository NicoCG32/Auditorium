# Uso y límites

## Un recorrido habitual

1. **Entro en la biblioteca** desde el navegador, incluso sin cuenta. Si es mi primer uso, la biblioteca local está vacía.
2. **Busco o incorporo un álbum**, indico artistas y su clasificación y puedo añadir ediciones y listas de pistas. El sistema ayuda a revisar duplicados, pero la decisión es mía.
3. **Registro mi experiencia**: estado de escucha, comentario, nota general o notas por género; también puedo valorar pistas individualmente.
4. **Organizo mi colección** agregando uno o más ejemplares, compras digitales o deseos de compra. Puedo retirar una entrada personal y recuperarla si sus condiciones lo permiten.
5. **Consulto o escucho** mediante enlaces, reproductores de Spotify/YouTube cuando corresponda, o archivos propios en este navegador.
6. **Creo un respaldo** antes de migrar a otro dispositivo, cambiar el origen web o realizar una modificación riesgosa.

## Qué se guarda y dónde

| Información                                     | Dónde vive                                              | Cómo la traslado                                  |
| ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Catálogo, escucha, notas, ediciones y colección | IndexedDB en este navegador                             | Respaldo JSON; cuenta opcional si está habilitada |
| Audio personal                                  | IndexedDB del dispositivo actual, separado del snapshot | Respaldo ZIP completo con audio                   |
| Clave de recomendaciones de IA                  | Memoria temporal de la interfaz                         | No se incluye en el respaldo                      |
| Recursos descargados para uso offline           | Caché del service worker                                | Se vuelven a preparar desde la aplicación         |

**El almacenamiento del navegador no es infalible**: puede perderse por limpieza de datos, cambio de perfil, cuotas o cambio de dominio. La sincronización opcional no sustituye un respaldo completo de archivos propios.

## Límites importantes

- **Escala de notas:** de 1 a 10 en incrementos de 0,5; no se infieren notas ausentes ni se promedian automáticamente las pistas.
- **Audio local:** hasta 16 MiB por archivo, 128 archivos y 128 MiB por biblioteca; la importación del ZIP completo aplica límites e integridad propios.
- **Respaldo de metadatos:** hasta 20 MiB por documento JSON/snapshot, según validación del código.
- **Streaming externo:** depende de sus proveedores y sus condiciones; una ficha no garantiza reproducción offline de sus servicios.
- **Cuenta:** existe solo si se ha configurado el proyecto Supabase. Con cuenta, los cambios entre dispositivos pueden generar conflictos que requieren revisión.
- **Versiones:** la importación aditiva y de catálogo figura en la sección «Sin publicar» del [changelog](../../CHANGELOG.md). Consulta las notas de tu versión antes de usar esos formatos.

## Importante antes de restaurar

La restauración completa exige un destino vacío y comprueba identidad, versiones e integridad antes de guardar. Para trasladar archivos de audio, usa el ZIP completo. La importación aditiva permite incorporar registros a una biblioteca existente, con revisión de conflictos; se explica en la [guía de importación JSON](../IMPORTACION_JSON.md). Conserva siempre una copia del respaldo original.

[Flujo detallado](../tecnica/04-flujos-y-estados.md) · [Persistencia](../tecnica/03-datos-y-persistencia.md)
