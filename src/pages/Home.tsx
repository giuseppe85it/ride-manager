import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ImpostazioniApp } from "../models/ImpostazioniApp";
import { importBmwGpxAndAutoAssign } from "../services/gpxService";
import { exportBackupJSON, getImpostazioniApp, restoreFromBackupJSON } from "../services/storage";
import ImpostazioniModal from "./ImpostazioniModal";
import "./Home.css";

interface HomeProps {
  onOpenViaggi: () => void;
}

function showComingSoon(featureName: string): void {
  window.alert(`${featureName}: in arrivo`);
}

function buildBackupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `RideManager_backup_${year}-${month}-${day}_${hours}-${minutes}.json`;
}

export default function Home({ onOpenViaggi }: HomeProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [impostazioni, setImpostazioni] = useState<ImpostazioniApp | undefined>(undefined);
  const [isQuickImporting, setIsQuickImporting] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const quickImportInputRef = useRef<HTMLInputElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSettings(): Promise<void> {
      try {
        const current = await getImpostazioniApp();
        if (isActive) {
          setImpostazioni(current);
        }
      } catch {
        if (isActive) {
          setImpostazioni(undefined);
        }
      }
    }

    void loadSettings();
    return () => {
      isActive = false;
    };
  }, []);

  const partecipantiCount = useMemo(() => {
    return impostazioni?.partecipanti.length ?? 0;
  }, [impostazioni]);

  async function handleQuickBmwImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsQuickImporting(true);
    try {
      const summary = await importBmwGpxAndAutoAssign(files);
      window.alert(
        `Importati ${summary.imported} GPX (${summary.createdDays} giorni creati, ${summary.createdTrips} viaggi creati)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore import GPX BMW";
      window.alert(`Errore import GPX rapido: ${message}`);
    } finally {
      setIsQuickImporting(false);
      event.target.value = "";
    }
  }

  async function handleExportBackup(): Promise<void> {
    setIsBackupBusy(true);
    try {
      const payload = await exportBackupJSON();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildBackupFileName();
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore export backup";
      window.alert(`Errore backup: ${message}`);
    } finally {
      setIsBackupBusy(false);
    }
  }

  async function handleRestoreBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error("JSON non valido");
      }

      const confirmed = window.confirm(
        "ATTENZIONE: questa operazione sovrascrive tutti i dati locali. Continuare?",
      );
      if (!confirmed) {
        return;
      }

      setIsBackupBusy(true);
      await restoreFromBackupJSON(parsed as Parameters<typeof restoreFromBackupJSON>[0]);
      window.alert("Ripristino completato. La pagina verra' ricaricata.");
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore ripristino backup";
      window.alert(`Errore ripristino: ${message}`);
    } finally {
      setIsBackupBusy(false);
      event.target.value = "";
    }
  }

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="home-layout">
          <header className="home-header">
            <p className="home-kicker">Travel dashboard</p>
            <h1>RideManager</h1>
            <span className="home-badge">{"Offline \u2022 GPX \u2022 PWA"}</span>
          </header>

          <section className="home-grid">
            <button type="button" className="home-card home-card-primary" onClick={onOpenViaggi}>
              <h2>Viaggi</h2>
              <p>Gestisci viaggi e tappe</p>
            </button>

            <button
              type="button"
              className="home-card"
              onClick={() => quickImportInputRef.current?.click()}
              disabled={isQuickImporting}
            >
              <h2>Import GPX rapido</h2>
              <p>{isQuickImporting ? "Import in corso..." : "BMW one-click auto-assign"}</p>
            </button>

            <button
              type="button"
              className="home-card"
              onClick={() => setIsSettingsOpen(true)}
            >
              <h2>Impostazioni</h2>
              <p>
                {partecipantiCount > 0
                  ? `${partecipantiCount} partecipanti configurati`
                  : "Configura partecipanti"}
              </p>
            </button>

            <div className="home-card" role="group" aria-label="Backup e ripristino">
              <h2>Backup / Export</h2>
              <p>Esporta e ripristina dati locali (JSON)</p>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void handleExportBackup()}
                  disabled={isBackupBusy}
                >
                  {isBackupBusy ? "Operazione..." : "Backup (esporta JSON)"}
                </button>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => restoreInputRef.current?.click()}
                  disabled={isBackupBusy}
                >
                  Ripristina (import JSON)
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <input
        ref={quickImportInputRef}
        type="file"
        accept=".gpx"
        multiple
        onChange={(event) => void handleQuickBmwImport(event)}
        style={{ display: "none" }}
      />

      <input
        ref={restoreInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleRestoreBackup(event)}
        style={{ display: "none" }}
      />

      <ImpostazioniModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(data) => setImpostazioni(data)}
      />
    </main>
  );
}
