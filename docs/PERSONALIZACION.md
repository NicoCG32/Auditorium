# Personalizar tu colección

Abre **Ajustes → Personalización**. La vista previa muestra el fondo, los colores y la presentación mientras los eliges. Puedes cambiar la apariencia sin salir de un álbum ni perder lo que estés escribiendo.

## Fondo y colores

- **Elegir imagen** acepta PNG, JPEG o WebP de hasta 15 MB y 40 megapíxeles. Auditorium prepara una copia reducida para guardarla en este dispositivo. La imagen permanece al cerrar o recargar la aplicación.
- **Combinar con el fondo** elige una de las paletas a partir de los colores de la imagen. Puedes seleccionar **Granate, Ámbar, Bosque, Océano, Violeta o Grafito** si prefieres otro resultado. Una paleta manual se conserva al cambiar la imagen.
- **Ajustar imagen** permite cambiar la intensidad y el encuadre. **Quitar imagen** vuelve al fondo de la aplicación.
- Elige **Oscuro** o **Claro**. Las paletas mantienen colores propios para superficies, texto, botones y foco en ambos temas.

El nombre de la colección, la vista de portadas o lista, su tamaño y los detalles de las tarjetas están en el mismo panel. Los cambios se guardan al elegirlos. El fondo decorativo de Auditorium sigue disponible cuando no usas una imagen propia.

## Guardar y abrir un diseño

En **Guardar o abrir un diseño**, **Guardar diseño** descarga un archivo con el fondo, tema, colores, nombre de la colección, vista, tamaño, detalles y orden. **Abrir diseño** permite revisar una vista previa antes de pulsar **Aplicar diseño**. Puedes conservar el actual.

El **respaldo completo ZIP** también incluye el diseño. Al restaurarlo puedes desmarcar **Usar también el diseño del respaldo** para conservar la apariencia del dispositivo de destino. Los respaldos anteriores siguen funcionando.

Los álbumes y archivos musicales se trasladan mediante los respaldos de la colección. El diseño por sí solo no los incluye; las vistas con filtros guardadas mantienen su almacenamiento local por identidad. La apariencia no se sincroniza con una cuenta. [Cómo hacer un respaldo](RESPALDOS_JSON.md).

Si el navegador impide guardar una imagen o un diseño importado, Auditorium conserva el diseño anterior y muestra cómo reintentar. Los cambios pequeños de presentación pueden seguir viéndose durante esa apertura, con un aviso para descargar una copia.

## Datos del diseño

`auditorium.personal-design.v1` contiene el diseño completo en un solo registro de `localStorage`. Se leen las preferencias anteriores de `auditorium.appearance.v1` y `auditorium.collection-view.v1` al abrir, conservando sus claves. La nueva clave sólo se escribe tras una elección del usuario.

La imagen se valida por firma, decodificación y dimensiones; se convierte a JPEG de hasta 1.920 píxeles en su lado mayor y una data URL de hasta 600.000 caracteres. El original temporal se libera después de prepararla o cancelarla. El color se calcula localmente sobre una muestra de 40 × 40 y selecciona tokens CSS prediseñados. No se admiten hojas CSS ni enlaces remotos dentro de un archivo de diseño.

El contrato de diseño tiene versión 1 y un límite de 768 KiB UTF-8. ZIP3 declara `design.json` con SHA-256, conserva JSON9 y los archivos de audio y portadas separados, y mantiene el máximo total de 288 MiB. La lectura admite ZIP1 y ZIP2 con sus límites anteriores. La biblioteca conserva su restauración atómica en IndexedDB; después se aplica el diseño en un único registro local. Si esa segunda escritura falla, el recibo de biblioteca restaurada se conserva y sólo se reintenta el diseño.
