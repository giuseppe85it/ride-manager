import { useEffect, useMemo, useState } from "react";
import CostiViaggio from "./CostiViaggio";
import Giorni from "./Giorni";
import PrenotazioniViaggio from "./PrenotazioniViaggio";
import type { Viaggio } from "../models/Viaggio";
import { getViaggi, saveViaggio } from "../services/storage";
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

const DEFAULT_UI_PARTECIPANTI = ["Peppe", "Elvira"];

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

function getPartecipantiForUi(viaggio: Viaggio | null): string[] {
  const raw = Array.isArray(viaggio?.partecipanti) ? viaggio.partecipanti : [];
  const sanitized = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);

  return sanitized.length > 0 ? sanitized : [...DEFAULT_UI_PARTECIPANTI];
}

function sanitizePartecipantiDraft(values: string[]): { sanitized?: string[]; error?: string } {
  if (!Array.isArray(values)) {
    return { error: "Partecipanti non validi." };
  }

  if (values.length < 1 || values.length > 6) {
    return { error: "Il numero partecipanti deve essere tra 1 e 6." };
  }

  const trimmed = values.map((value) => value.trim());
  if (trimmed.some((value) => value.length === 0)) {
    return { error: "Compila tutti i nomi dei partecipanti per salvare." };
  }

  return { sanitized: trimmed.slice(0, 6) };
}

function samePartecipanti(left?: string[], right?: string[]): boolean {
  const leftNorm = Array.isArray(left) ? left : [];
  const rightNorm = Array.isArray(right) ? right : [];
  if (leftNorm.length !== rightNorm.length) {
    return false;
  }
  return leftNorm.every((value, index) => value === rightNorm[index]);
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
  const [partecipantiDraft, setPartecipantiDraft] = useState<string[]>([...DEFAULT_UI_PARTECIPANTI]);
  const [partecipantiTouched, setPartecipantiTouched] = useState(false);
  const [partecipantiSaving, setPartecipantiSaving] = useState(false);
  const [partecipantiError, setPartecipantiError] = useState<string | null>(null);
  const [partecipantiInfo, setPartecipantiInfo] = useState<string | null>(null);

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

  useEffect(() => {
    setPartecipantiDraft(getPartecipantiForUi(viaggio));
    setPartecipantiTouched(false);
    setPartecipantiSaving(false);
    setPartecipantiError(null);
    setPartecipantiInfo(null);
  }, [viaggio?.id, viaggio?.partecipanti]);

  useEffect(() => {
    if (!viaggio || !partecipantiTouched) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const validation = sanitizePartecipantiDraft(partecipantiDraft);
      if (!validation.sanitized) {
        setPartecipantiError(validation.error ?? "Partecipanti non validi.");
        setPartecipantiInfo(null);
        return;
      }

      if (samePartecipanti(validation.sanitized, viaggio.partecipanti)) {
        setPartecipantiError(null);
        setPartecipantiInfo("Partecipanti aggiornati.");
        setPartecipantiTouched(false);
        return;
      }

      async function persist(): Promise<void> {
        setPartecipantiSaving(true);
        setPartecipantiError(null);
        setPartecipantiInfo(null);

        try {
          const updated: Viaggio = {
            ...viaggio,
            partecipanti: validation.sanitized,
          };
          await saveViaggio(updated);
          if (cancelled) {
            return;
          }
          setViaggio(updated);
          setPartecipantiTouched(false);
          setPartecipantiInfo("Partecipanti salvati.");
        } catch (saveError) {
          if (cancelled) {
            return;
          }
          const message =
            saveError instanceof Error ? saveError.message : "Errore salvataggio partecipanti";
          setPartecipantiError(message);
        } finally {
          if (!cancelled) {
            setPartecipantiSaving(false);
          }
        }
      }

      void persist();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [partecipantiDraft, partecipantiTouched, viaggio]);

  const partecipantiAttiviLabel = useMemo(() => {
    return partecipantiDraft
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(", ");
  }, [partecipantiDraft]);

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
            <p className="metaText" style={{ margin: viaggio.area ? "0.35rem 0 0 0" : "0.2rem 0 0 0" }}>
              Partecipanti: {getPartecipantiForUi(viaggio).join(", ")}
            </p>
          </div>
        )}

        {error && <p className="errorText">{error}</p>}

        {viaggio && (
          <div className="card detailCard" style={{ marginBottom: "1rem", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1rem" }}>Partecipanti viaggio</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <label className="metaText" style={{ margin: 0 }}>
                  Numero partecipanti
                </label>
                <select
                  className="inputField"
                  style={{ minWidth: "90px" }}
                  value={String(partecipantiDraft.length)}
                  onChange={(event) => {
                    const nextCount = Number.parseInt(event.target.value, 10);
                    if (!Number.isFinite(nextCount) || nextCount < 1 || nextCount > 6) {
                      return;
                    }
                    setPartecipantiTouched(true);
                    setPartecipantiInfo(null);
                    setPartecipantiError(null);
                    setPartecipantiDraft((current) => {
                      const next = current.slice(0, nextCount);
                      while (next.length < nextCount) {
                        next.push("");
                      }
                      return next;
                    });
                  }}
                >
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <option key={`participants-count-${count}`} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => {
                    setPartecipantiTouched(true);
                    setPartecipantiInfo(null);
                    setPartecipantiError(null);
                    setPartecipantiDraft([...DEFAULT_UI_PARTECIPANTI]);
                  }}
                >
                  Ripristina default
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.65rem",
                marginTop: "0.8rem",
              }}
            >
              {partecipantiDraft.map((nome, index) => (
                <input
                  key={`trip-partecipante-${index}`}
                  className="inputField"
                  type="text"
                  value={nome}
                  placeholder={`Partecipante ${index + 1}`}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setPartecipantiTouched(true);
                    setPartecipantiInfo(null);
                    setPartecipantiError(null);
                    setPartecipantiDraft((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? nextValue : item)),
                    );
                  }}
                />
              ))}
            </div>

            <p className="metaText" style={{ margin: "0.75rem 0 0 0" }}>
              Partecipanti attivi: {partecipantiAttiviLabel || "Compila i nomi"}
            </p>
            {partecipantiDraft.length !== 2 && (
              <p className="metaText" style={{ margin: "0.35rem 0 0 0", color: "#fbbf24" }}>
                Split DIVISO e saldo 50/50 attualmente supportati solo con 2 partecipanti.
              </p>
            )}
            {partecipantiSaving && (
              <p className="metaText" style={{ margin: "0.35rem 0 0 0" }}>
                Salvataggio partecipanti...
              </p>
            )}
            {!partecipantiSaving && partecipantiInfo && (
              <p className="metaText" style={{ margin: "0.35rem 0 0 0", color: "#93c5fd" }}>
                {partecipantiInfo}
              </p>
            )}
            {partecipantiError && (
              <p className="errorText" style={{ margin: "0.35rem 0 0 0" }}>
                {partecipantiError}
              </p>
            )}
          </div>
        )}

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
        {activeTab === "costi" && <CostiViaggio viaggioId={viaggioId} partecipantiViaggio={viaggio?.partecipanti} />}

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
