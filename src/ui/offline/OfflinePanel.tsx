import { useSyncExternalStore } from 'react'
import type { OfflineController } from '../../infrastructure/browser/offline-controller'

const shellLabels = {
  development: 'Modo de desarrollo: caché offline desactivada.',
  unsupported: 'Este navegador no permite preparar la aplicación sin conexión.',
  preparing: 'Preparando la aplicación para usarla sin conexión…',
  ready: 'Aplicación preparada para usar sin conexión.',
  failed:
    'No se pudo preparar la aplicación sin conexión. Vuelve a abrirla con conexión para reintentar.',
}
const storageLabels = {
  checking: 'Consultando almacenamiento…',
  available: 'El navegador puede liberar el almacenamiento automáticamente.',
  persistent:
    'El navegador ha concedido protección frente a la limpieza automática.',
  denied:
    'El navegador no concedió protección. Puedes seguir usando la biblioteca y descargar respaldos.',
  unsupported: 'Este navegador no informa si puede proteger el almacenamiento.',
  failed: 'No se pudo comprobar o solicitar protección. Puedes reintentarlo.',
}
function megabytes(bytes: number) {
  return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(
    bytes / (1024 * 1024),
  )
}

export function OfflinePanel({
  controller,
}: {
  controller: OfflineController
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )
  return (
    <aside className="offline-panel" aria-label="Aplicación y almacenamiento">
      <p role="status">
        {state.update === 'available'
          ? 'Nueva versión lista para la próxima apertura.'
          : shellLabels[state.shell]}
        {!state.online && ' El navegador indica que no hay conexión.'}
      </p>
      <details>
        <summary>Aplicación y almacenamiento</summary>
        <div className="mt-4 grid gap-4">
          <p>
            Después de prepararse, puedes abrir la biblioteca, registrar álbumes
            y gestionar ediciones, notas, valoraciones, ejemplares, deseos y
            respaldos sin conexión. Las portadas y enlaces externos necesitan
            red.
          </p>
          {state.update === 'available' && (
            <p className="field-notice">
              Guarda tus cambios y cierra todas las pestañas y ventanas de
              Auditórium, incluida la aplicación instalada. La nueva versión se
              activará al volver a abrirla. Tu biblioteca guardada se conserva.
            </p>
          )}
          {state.shell === 'ready' && state.update !== 'available' && (
            <div>
              <button
                type="button"
                className="action-button"
                disabled={state.update === 'checking' || !state.online}
                onClick={() => {
                  void controller.checkUpdate()
                }}
              >
                {state.update === 'checking'
                  ? 'Comprobando actualización…'
                  : 'Comprobar actualización'}
              </button>
              {state.update === 'failed' && (
                <p role="alert" className="field-error">
                  No se pudo comprobar o descargar la actualización. La versión
                  actual sigue disponible; vuelve a intentar con conexión.
                </p>
              )}
            </div>
          )}
          <div>
            {state.installation === 'installed' ? (
              <p>Aplicación instalada.</p>
            ) : (
              <>
                <p>
                  Si tu navegador lo permite, instala Auditórium desde su menú.
                  En iPhone o iPad, usa Compartir → Añadir a pantalla de inicio.
                  La biblioteca depende del navegador, dispositivo y modo de
                  apertura. Si la aplicación instalada aparece vacía, mueve tus
                  datos con un respaldo JSON.
                </p>
                {(state.installation === 'available' ||
                  state.installation === 'pending') && (
                  <button
                    className="action-button mt-3"
                    type="button"
                    disabled={state.installation === 'pending'}
                    onClick={() => {
                      void controller.install()
                    }}
                  >
                    {state.installation === 'pending'
                      ? 'Esperando al navegador…'
                      : 'Instalar Auditórium'}
                  </button>
                )}
                {state.installation === 'dismissed' && (
                  <p>
                    Instalación cancelada. Puedes intentarlo desde el menú del
                    navegador.
                  </p>
                )}
                {state.installation === 'failed' && (
                  <p role="alert">
                    No se pudo abrir la instalación. Usa el menú del navegador
                    si está disponible.
                  </p>
                )}
              </>
            )}
          </div>
          <div>
            <p role="status">{storageLabels[state.storage]}</p>
            {state.usage !== undefined && state.quota !== undefined && (
              <p className="mt-2">
                Uso estimado de este sitio: {megabytes(state.usage)} MiB de{' '}
                {megabytes(state.quota)} MiB. Incluye la aplicación y la
                biblioteca; la cuota puede cambiar.
              </p>
            )}
            {controller.canRequestPersistence() &&
              state.storage !== 'persistent' && (
                <button
                  type="button"
                  className="action-button mt-3"
                  disabled={state.storage === 'checking'}
                  onClick={() => {
                    void controller.requestPersistence()
                  }}
                >
                  Solicitar protección del almacenamiento
                </button>
              )}
          </div>
          <p>
            Los datos permanecen en este navegador. Borrar los datos del sitio,
            usar navegación privada o perder el dispositivo puede eliminar la
            biblioteca, incluso con protección. Descarga respaldos JSON
            periódicos desde «Respaldos» y guárdalos fuera de este dispositivo.
          </p>
        </div>
      </details>
    </aside>
  )
}
