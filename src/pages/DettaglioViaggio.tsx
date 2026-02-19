import { useEffect, useState } from "react";
import Giorni from "./Giorni";
import type { Viaggio } from "../models/Viaggio";
import { getViaggi } from "../services/storage";
import "../styles/theme.css";

interface DettaglioViaggioProps {
  viaggioId: string;
  onBack: () => void;
  onOpenGiorno: (giornoId: string) => void;
}

type ViaggioTab = "giorni" | "prenotazioni" | "costi" | "media" | "dashboard";

const TABS: Array<{ key: ViaggioTab; label: string }> = [
  { key: "giorni", label: "Giorni" },
  { key: "prenotazioni", label: "Prenotazioni" },
  { key: "costi", label: "Costi" },
  { key: "media", label: "Media" },
  { key: "dashboard", label: "Dashboard" },
];

function formatDate(value: string): string {
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return value;
}

function statoViaggioLabel(stato: Viaggio["stato"]): string {
  if (stato === "PIANIFICAZIONE") return "Pianificazione";
  if (stato === "ATTIVO") return "Attivo";
  if (stato === "CONCLUSO") return "Concluso";
  return "Archiviato";
}

export default function DettaglioViaggio({
  viaggioId,
  onBack,
  onOpenGiorno,
}: DettaglioViaggioProps) {
  const [viaggio, setViaggio] = useState<Viaggio | null>(null);
  const [activeTab, setActiveTab] = useState<ViaggioTab>("giorni");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadViaggio(): Promise<void> {
      try {
        const viaggi = await getViaggi();
        const match = viaggi.find((item) => item.id === viaggioId) ?? null;
        if (isActive) {
          setViaggio(match);
        }
      } catch (loadError) {
        if (isActive) {
          const message =
            loadError instanceof Error ? loadError.message : "Errore caricamento dettaglio viaggio";
          setError(message);
        }
      }
    }

    void loadViaggio();

    return () => {
      isActive = false;
    };
  }, [viaggioId]);

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="toolbar">
          <button type="button" onClick={onBack} className="buttonGhost">
            {"\u2190"} Viaggi
          </button>
          <h1 className="pageTitle">{viaggio?.nome ?? "Dettaglio viaggio"}</h1>
          {viaggio && <span className="badge">{statoViaggioLabel(viaggio.stato)}</span>}
        </div>

        {viaggio && (
          <div className="card detailCard" style={{ marginBottom: "1rem" }}>
            <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
              {formatDate(viaggio.dataInizio)} {"\u2192"} {formatDate(viaggio.dataFine)}
            </p>
            {viaggio.area && (
              <p className="metaText" style={{ margin: 0 }}>
                Area: {viaggio.area}
              </p>
            )}
          </div>
        )}

        {error && <p className="errorText">{error}</p>}

        <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={activeTab === tab.key ? "buttonPrimary" : "buttonGhost"}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "giorni" && <Giorni viaggioId={viaggioId} onOpenGiorno={onOpenGiorno} embedded />}

        {activeTab !== "giorni" && (
          <div className="card" style={{ padding: "1rem" }}>
            <p className="metaText" style={{ margin: 0 }}>
              In arrivo
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
