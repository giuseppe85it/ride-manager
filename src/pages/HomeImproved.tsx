import "./HomeImproved.css";

export interface HomeImprovedProps {
  onOpenViaggi?: () => void;
  onQuickImport?: () => void;
  onOpenSettings?: () => void;
  onCloudBackup?: () => void;
  onExportBackup?: () => void;
  onRestoreBackup?: () => void;
}

function noop(): void {
  // Intentionally empty: layout export placeholder actions.
}

export default function HomeImproved({
  onOpenViaggi = noop,
  onQuickImport = noop,
  onOpenSettings = noop,
  onCloudBackup = noop,
  onExportBackup = noop,
  onRestoreBackup = noop,
}: HomeImprovedProps) {
  return (
    <main className="hiHome">
      <div className="hiHome__shell">
        <div className="hiHome__layout">
          <header className="hiHome__header">
            <p className="hiHome__kicker">TRAVEL DASHBOARD</p>
            <h1 className="hiHome__title">RideManager</h1>

            <span className="hiHome__badge">Offline • GPX • PWA</span>

            <p className="hiHome__helper">
              Gestisci viaggi, import GPX e sincronizzazione cloud da una dashboard unica.
            </p>
          </header>

          <section className="hiHome__grid" aria-label="Azioni Home">
            <div className="hiHome__row hiHome__row--fixed">
              <button type="button" className="hiCard hiCard--primary" onClick={onOpenViaggi}>
                <h2 className="hiCard__title">Viaggi</h2>
                <p className="hiCard__text">Gestisci viaggi e tappe</p>
                <span className="hiChip hiChip--primary">Azione principale</span>
              </button>

              <button type="button" className="hiCard" onClick={onQuickImport}>
                <h2 className="hiCard__title">Import GPX rapido</h2>
                <p className="hiCard__text">BMW one-click auto-assign</p>
              </button>
            </div>

            <div className="hiHome__row hiHome__row--flex">
              <button type="button" className="hiCard" onClick={onOpenSettings}>
                <h2 className="hiCard__title">Impostazioni</h2>
                <p className="hiCard__text">Configura partecipanti</p>
              </button>

              <section className="hiCard hiCard--cloud" aria-label="Sincronizzazione Cloud">
                <h2 className="hiCard__title hiCard__title--cloud">Sincronizzazione Cloud</h2>
                <p className="hiCard__text">Stato sync Firestore e retry outbox</p>

                <div className="hiChips" aria-label="Stato sincronizzazione">
                  <span className="hiChip hiChip--success">Firestore: Online</span>
                  <span className="hiChip hiChip--neutral">Outbox: 0</span>
                  <span className="hiChip hiChip--neutralStrong">Stato: OK</span>
                </div>

                <button type="button" className="hiButton hiButton--cloud" onClick={onCloudBackup}>
                  Cloud Backup
                </button>

                <div className="hiCloudAdvanced">
                  <h3 className="hiCloudAdvanced__title">Avanzate / Diagnostica</h3>
                  <p className="hiCloudAdvanced__text">
                    Backup/ripristino locale JSON (diagnostica/manuale)
                  </p>

                  <div className="hiCloudAdvanced__actions">
                    <button type="button" className="hiButton hiButton--ghost" onClick={onExportBackup}>
                      Backup (esporta JSON)
                    </button>
                    <button type="button" className="hiButton hiButton--ghost" onClick={onRestoreBackup}>
                      Ripristina (import JSON)
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
