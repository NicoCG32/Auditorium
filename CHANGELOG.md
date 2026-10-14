# Changelog

## 1.0.0 — 2026-10-13

Primera release estable del MVP local. Completa las Fases 0–4.

- Biblioteca persistente con registro manual, revisión de duplicados, búsqueda, filtros, ordenación y vistas de cuadrícula/lista.
- Ficha de álbum con escucha, comentarios y valoraciones de 1 a 10 en pasos de 0,5; notas de álbum y pistas independientes.
- Listas originales, ediciones, apariciones de pistas compartidas y variantes con valoración propia.
- Ejemplares físicos, compras digitales y deseos por formato o edición, con cumplimiento explícito mediante una compra coincidente.
- Retirada reversible de álbumes, confirmaciones de eliminación y respaldos JSON con restauración íntegra en una biblioteca vacía.
- PWA para reabrir y gestionar la biblioteca offline tras prepararse; actualizaciones que esperan al cierre de las ventanas, información de almacenamiento y recuperación segura ante fallos.
- Verificación automatizada de dominio, interfaz y persistencia, aceptación en Chromium/Firefox/WebKit, accesibilidad, teclado y pantallas.
- Paquete estático con instrucciones, avisos de dependencias e inventario SHA-256, distribuido como ZIP con checksum.

La aplicación guarda los datos en el origen y perfil del navegador. Las portadas y enlaces externos requieren red. Las cuentas, sincronización, importación automática de plataformas y reproducción musical corresponden a etapas posteriores. Consulta los [límites y la guía de entrega](https://github.com/NicoCG32/Auditorium/blob/v1.0.0/docs/ENTREGA_MVP.md).
