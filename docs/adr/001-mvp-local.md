# ADR-001 — MVP con almacenamiento local

Estado: aceptada para el MVP.
Fecha: 2026-10-11.

## Contexto

El registro manual de la biblioteca debe funcionar sin cuentas, claves ni servidores externos. La aplicación debe conservar datos entre recargas y permitir trabajar sin conexión una vez preparada la caché de la aplicación.

## Decisión

Construir una SPA con React y TypeScript. Incorporar IndexedDB mediante Dexie en Fase 1, manteniendo dominio y casos de uso separados de React y del adaptador de almacenamiento. Las operaciones con varias entidades serán transaccionales.

La PWA y su caché se implementarán en Fase 4. IndexedDB conservará los datos musicales; el service worker conservará los recursos de la aplicación. La identidad local será un UUID persistente por instalación. Autenticación y sincronización quedan para etapas posteriores.

## Consecuencias

- Una biblioteca pertenece inicialmente a un navegador y dispositivo; abrir otra instalación no recupera los datos automáticamente.
- El navegador puede eliminar almacenamiento. El MVP completo requiere exportación y restauración JSON versionadas y validadas antes de usar una colección real.
- No borrar ni recrear la base automáticamente al fallar. Informar errores y conservar opciones de recuperación.
- Aislar la persistencia facilita pruebas y evolución, pero no convierte una migración futura a otro motor en una sustitución automática.

Esta decisión describe la arquitectura prevista; la base de datos, respaldos y caché offline todavía no están implementados en Fase 0.
