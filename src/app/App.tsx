export function App() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>

      <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-7 sm:px-10 lg:px-16">
        <span className="flex items-center gap-3 font-display text-sm font-black tracking-[0.16em]">
          <span className="brand-mark" aria-hidden="true" />
          AUDITÓRIUM
        </span>
        <span className="text-xs tracking-[0.08em] text-muted">
          Archivo musical personal
        </span>
      </header>

      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:px-16 lg:py-20"
      >
        <section aria-labelledby="bienvenida" className="min-w-0">
          <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-accent-text uppercase">
            <span className="h-px w-8 bg-accent-text" aria-hidden="true" />
            Escuchar. Descubrir. Conservar.
          </p>
          <h1 id="bienvenida" className="welcome-title font-display font-black">
            Auditórium
          </h1>
          <p className="mt-5 text-2xl leading-snug sm:text-3xl">
            Un lugar para tu música.
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Los álbumes que te acompañan. Las ediciones que descubres. Los
            discos que quieres conservar. Todo tiene una historia.
          </p>
          <div className="mt-10 border-l-2 border-accent pl-5">
            <p className="text-sm font-semibold">
              Tu biblioteca está en camino.
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Estamos preparando un espacio para tu colección y tus próximos
              descubrimientos.
            </p>
          </div>
        </section>

        <div className="record-art" aria-hidden="true">
          <div className="record-sleeve">
            <div className="sleeve-rule" />
            <span className="sleeve-caption">EL ARCHIVO DE TU MÚSICA</span>
            <div className="vinyl-record">
              <div className="record-label">
                <span>A</span>
                <div className="record-spindle" />
                <span>33 ⅓</span>
              </div>
            </div>
            <span className="sleeve-signature">AUDITÓRIUM</span>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-6 pb-7 sm:px-10 lg:px-16">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted">
          <p>Tu música. Tu criterio. Tu colección.</p>
          <p>Una biblioteca con identidad propia.</p>
        </div>
      </footer>
    </div>
  )
}
