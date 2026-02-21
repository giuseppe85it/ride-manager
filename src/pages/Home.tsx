import { useEffect, useMemo, useState } from "react";
import type { ImpostazioniApp } from "../models/ImpostazioniApp";
import { getImpostazioniApp } from "../services/storage";
import ImpostazioniModal from "./ImpostazioniModal";
import "./Home.css";

interface HomeProps {
  onOpenViaggi: () => void;
}

function showComingSoon(featureName: string): void {
  window.alert(`${featureName}: in arrivo`);
}

export default function Home({ onOpenViaggi }: HomeProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [impostazioni, setImpostazioni] = useState<ImpostazioniApp | undefined>(undefined);

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
              onClick={() => showComingSoon("Import GPX rapido")}
            >
              <h2>Import GPX rapido</h2>
              <p>In arrivo</p>
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

            <button
              type="button"
              className="home-card"
              onClick={() => showComingSoon("Backup / Export")}
            >
              <h2>Backup / Export</h2>
              <p>In arrivo</p>
            </button>
          </section>
        </div>
      </div>

      <ImpostazioniModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(data) => setImpostazioni(data)}
      />
    </main>
  );
}
