import { useEffect, useState } from "react";
import CostiViaggio from "./CostiViaggio";
import Giorni from "./Giorni";
import PrenotazioniViaggio from "./PrenotazioniViaggio";
import type { Viaggio } from "../models/Viaggio";
import { getViaggi } from "../services/storage";
import { getTripStats, type TripStats } from "../services/tripStats";
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

function formatDateTime(value?: string): string {
  if (!value) {
    return "\u2014";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "\u2014";
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function DettaglioViaggio({
  viaggioId,
  onBack,
  onOpenGiorno,
}: DettaglioViaggioProps) {
  const [viaggio, setViaggio] = useState<Viaggio | null>(null);
  const [activeTab, setActiveTab] = useState<ViaggioTab>("giorni");
  const [error, setError] = useState<string | null>(null);
  const [tripStats, setTripStats] = useState<TripStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  useEffect(() => {
    let isActive = true;

    async function loadStats(): Promise<void> {
      if (activeTab !== "dashboard") {
        return;
      }

      setStatsLoading(true);
      setStatsError(null);

      try {
        const stats = await getTripStats(viaggioId);
        if (isActive) {
          setTripStats(stats);
        }
      } catch (statsLoadError) {
        if (isActive) {
          const message =
            statsLoadError instanceof Error
              ? statsLoadError.message
              : "Errore caricamento dashboard viaggio";
          setStatsError(message);
          setTripStats(null);
        }
      } finally {
        if (isActive) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      isActive = false;
    };
  }, [activeTab, viaggioId]);

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
        {activeTab === "prenotazioni" && <PrenotazioniViaggio viaggioId={viaggioId} />}
        {activeTab === "costi" && <CostiViaggio viaggioId={viaggioId} />}

        {activeTab === "dashboard" && (
          <div className="card detailCard" style={{ padding: "1rem" }}>
            {statsLoading && (
              <p className="metaText" style={{ margin: 0 }}>
                Calcolo statistiche...
              </p>
            )}

            {!statsLoading && statsError && <p className="errorText">{statsError}</p>}

            {!statsLoading && !statsError && tripStats && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <div className="card" style={{ padding: "0.75rem" }}>
                  <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
                    Km totali
                  </p>
                  <strong>{tripStats.kmTotali.toFixed(1)} km</strong>
                </div>
                <div className="card" style={{ padding: "0.75rem" }}>
                  <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
                    Giorni
                  </p>
                  <strong>
                    Totali {tripStats.giorniTotali} | GPX {tripStats.giorniConGPX} | Vuoti {tripStats.giorniVuoti}
                  </strong>
                  <p className="metaText" style={{ margin: "0.35rem 0 0 0" }}>
                    Completati: {tripStats.giorniCompletati}
                  </p>
                </div>
                <div className="card" style={{ padding: "0.75rem" }}>
                  <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
                    Prima traccia
                  </p>
                  <strong>{formatDateTime(tripStats.dataPrimaTraccia)}</strong>
                </div>
                <div className="card" style={{ padding: "0.75rem" }}>
                  <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
                    Ultima traccia
                  </p>
                  <strong>{formatDateTime(tripStats.dataUltimaTraccia)}</strong>
                </div>
                <div className="card" style={{ padding: "0.75rem" }}>
                  <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
                    Ultimo punto GPS
                  </p>
                  {tripStats.ultimoPunto ? (
                    <>
                      <strong>
                        {tripStats.ultimoPunto.lat.toFixed(5)}, {tripStats.ultimoPunto.lon.toFixed(5)}
                      </strong>
                      <p className="metaText" style={{ margin: "0.35rem 0 0 0" }}>
                        {formatDateTime(tripStats.ultimoPunto.time)}
                      </p>
                    </>
                  ) : (
                    <strong>{"\u2014"}</strong>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab !== "giorni" &&
          activeTab !== "dashboard" &&
          activeTab !== "prenotazioni" &&
          activeTab !== "costi" && (
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
