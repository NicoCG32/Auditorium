# Biblioteca: búsqueda, filtros y consulta

La Biblioteca es la entrada principal a la música guardada. El menú mantiene el recorrido **Biblioteca → Añadir álbum → Calificaciones → Mi colección**. Añadir álbum permanece visible; las utilidades se abren desde **Más opciones**.

## Encontrar un álbum

La búsqueda consulta título, artista, género y país. El orden permite elegir incorporaciones recientes, título, artista, nota, género o país. Cuadrícula y Lista cambian la presentación del mismo resultado.

**Filtros** despliega género, país de origen, escucha y nota. Las selecciones se combinan con la búsqueda. Su contador incluye únicamente esos cuatro filtros; la búsqueda y el orden no aumentan el contador.

Los filtros activos siguen visibles como etiquetas aunque el panel esté cerrado. Pulsar una etiqueta quita sólo esa selección. **Limpiar búsqueda y filtros** elimina la búsqueda y las selecciones y recupera el orden de incorporaciones recientes; conserva Cuadrícula o Lista. Si no hay coincidencias, **Mostrar todos los álbumes** ofrece la misma recuperación.

El total indica cuántos álbumes coinciden respecto de la biblioteca completa. Los valores y reglas de consulta se describen en [Consulta de Biblioteca](CONSULTA_BIBLIOTECA.md).

## Abrir y regresar

La portada y el título abren la misma ficha. Cada tarjeta distingue artista, año, país, géneros, estado de escucha y **Mi nota**; carecer de nota no equivale a cero. Sin portada se utiliza una composición de disco, manteniendo el acceso a la ficha.

Al volver se conservan búsqueda, filtros, orden, vista, posición y foco mientras siga viva la pestaña. El panel de filtros puede cerrarse sin perder selecciones. Recargar recupera los datos guardados, pero no promete recuperar el contexto temporal de consulta. La [guía de navegación](NAVEGACION.md) explica rutas y borradores.

## Utilidades y estados

Más opciones reúne Recomendaciones, Respaldos, Álbumes retirados, Deseos de compra, Cuenta y dispositivos y Actualizar biblioteca. Se cierra al elegir un destino, pulsar Escape o tocar fuera. Escape devuelve el foco al control que abre el menú; si se cancela una navegación protegida por borradores, el foco vuelve a ese control visible.

Una biblioteca vacía invita a añadir el primer álbum. Una consulta sin coincidencias ofrece limpiar la selección. Los fallos de lectura conservan los datos y muestran una explicación y una acción para reintentar; no se presentan como una biblioteca vacía.

## Presentación y accesibilidad

La composición adapta cabecera, búsqueda y tarjetas a móvil y escritorio, con ambos temas y ambientación opcional. Los filtros empiezan plegados para dejar visibles la búsqueda y el comienzo de la música a 360 × 800. A 320 px las tarjetas pasan a una columna; el texto ampliado y los controles pueden ocupar más filas sin desplazamiento horizontal.

Los controles utilizan etiquetas accesibles, estado de vista seleccionada, indicador de expansión y foco visible. Portada y título se activan con teclado. La validación automatizada cubre ambos temas a 360 y 1280 px, texto al 200 %, movimiento reducido, ambientación desactivada, auditoría axe y regreso con contexto en Chromium, Firefox y WebKit. Las capturas usan exclusivamente álbumes y portadas ficticios.

Esta entrega corresponde a [VIS-02 #63](https://github.com/NicoCG32/Auditorium/issues/63). No modifica el modelo de álbum, ediciones, calificaciones o adquisiciones; los refinamientos de esos formularios conservan sus tareas en el [Project](https://github.com/users/NicoCG32/projects/4).
