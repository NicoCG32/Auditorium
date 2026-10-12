# Diseño base

La identidad de Auditorium parte de negro, carmesí y blanco hueso, con superficies y detalles inspirados en fundas de vinilo. La interfaz usa fuentes del sistema, sin recursos remotos necesarios para el renderizado.

## Tokens

`src/styles/base.css` concentra las variables semánticas. Tailwind las expone como utilidades mediante `@theme inline`; los componentes consumen nombres como `bg-background`, `text-foreground` y `text-muted`.

| Token       | Valor   | Uso                                |
| ----------- | ------- | ---------------------------------- |
| background  | #0C0C0E | Fondo principal                    |
| surface     | #1B1B20 | Superficies                        |
| foreground  | #C8BEB0 | Texto principal                    |
| muted       | #AAA398 | Texto secundario legible           |
| accent      | #8E1522 | Franjas y fondos carmesí           |
| accent-text | #DF5968 | Texto destacado sobre fondo oscuro |
| focus       | #EF7681 | Foco visible de teclado            |
| border      | #38383F | Separadores decorativos            |

El carmesí profundo se reserva para fondos y decoración. El gris secundario se aclara respecto de la paleta conceptual para mantener legibilidad. Comprobar contraste en cada combinación real al añadir componentes; los tokens no garantizan por sí solos accesibilidad de cualquier uso.

## Interacción y adaptación

- Biblioteca con cuadrícula adaptable de una a cuatro columnas y vista de lista, sin anchos fijos de contenido.
- Enlace «Ir al contenido» visible al recibir foco; destino principal identificable.
- Foco visible de tres píxeles y enlaces con área de al menos 44 píxeles de alto.
- Sin animaciones continuas; las transiciones se desactivan con `prefers-reduced-motion`.
- Decoración de vinilo en CSS, marcada como decorativa para lectores de pantalla. La ficha permite mostrar una URL de portada guardada por acción explícita; no se distribuyen carátulas ajenas.
- Controles de búsqueda, escucha, nota, orden y vista operativos sobre la biblioteca guardada. Registro manual con validación, revisión de duplicados y ficha con metadatos y valoración. Errores de escritura y lectura con reintento y foco accesible.
- Estados separados de carga, vacío, sin coincidencias y error con reintento. Ver [consulta de biblioteca](CONSULTA_BIBLIOTECA.md).

El tema oscuro es el único implementado actualmente. Las variables permiten incorporar otros temas más adelante; no se implementa todavía selector de tema ni persistencia de preferencias.

Referencias: [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite), [variables de tema](https://tailwindcss.com/docs/theme) y [contraste de texto](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).
