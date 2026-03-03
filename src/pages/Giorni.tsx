import { useEffect, useMemo, useState } from "react";
import type { Giorno } from "../models/Giorno";
import type { Prenotazione } from "../models/Prenotazione";
import {
  deleteGiorno,
  deleteGpxFilesByGiornoId,
  deleteTrackPointsByGiornoId,
  getGiorniByViaggio,
  getPrenotazioniByViaggio,
  saveGiorno,
} from "../services/storage";
import "../styles/theme.css";

interface GiorniProps {
  viaggioId: string;
  onBack?: () => void;
  onOpenGiorno: (giornoId: string) => void;
  embedded?: boolean;
}

function generateId(prefix = "giorno"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return value;
}

function statoGiornoLabel(stato: Giorno["stato"]): string {
  if (stato === "PIANIFICATO") return "Pianificato";
  if (stato === "IN_CORSO") return "In corso";
  return "Fatto";
}

function compactStopLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const firstChunk = trimmed.split(",")[0]?.trim() ?? trimmed;
  if (firstChunk.length <= 18) {
    return firstChunk;
  }

  return `${firstChunk.slice(0, 17)}…`;
}

function buildRidePillLabel(originText?: string, destinationText?: string): string {
  const origin = typeof originText === "string" ? compactStopLabel(originText) : "";
  const destination = typeof destinationText === "string" ? compactStopLabel(destinationText) : "";

  if (origin && destination) {
    return `${origin}→${destination}`;
  }

  return "Tratta";
}

function buildSequenceSummary(giorno: Giorno): string[] {
  const pills: string[] = [];
  const segments = giorno.dayPlan?.segments;

  if (Array.isArray(segments) && segments.length > 0) {
    for (const segment of segments) {
      if (segment.type === "RIDE") {
        pills.push(buildRidePillLabel(segment.originText, segment.destinationText));
      } else {
        pills.push("Traghetto");
      }
    }
  } else {
    const origin = typeof giorno.plannedOriginText === "string" ? compactStopLabel(giorno.plannedOriginText) : "";
    const destination =
      typeof giorno.plannedDestinationText === "string" ? compactStopLabel(giorno.plannedDestinationText) : "";
    if (origin && destination) {
      pills.push(`${origin}→${destination}`);
    } else if (typeof giorno.plannedMapsUrl === "string" && giorno.plannedMapsUrl.trim()) {
      pills.push("Link Maps");
    }
  }

  if (giorno.hotelPrenotazioneId) {
    pills.push("Hotel");
  }

  return pills;
}

export default function Giorni({ viaggioId, onBack, onOpenGiorno, embedded = false }: GiorniProps) {
  const [giorni, setGiorni] = useState<Giorno[]>([]);
  const [data, setData] = useState(todayDate());
  const [titolo, setTitolo] = useState("");
  const [stato, setStato] = useState<Giorno["stato"]>("PIANIFICATO");
  const [hotelPrenotazioneId, setHotelPrenotazioneId] = useState("");
  const [plannedMapsUrl, setPlannedMapsUrl] = useState("");
  const [hotelOptions, setHotelOptions] = useState<Prenotazione[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenForDayId, setMenuOpenForDayId] = useState<string | null>(null);
  const [editTitleDay, setEditTitleDay] = useState<Giorno | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");

  const hotelById = useMemo(
    () => new Map(hotelOptions.map((hotel) => [hotel.id, hotel] as const)),
    [hotelOptions],
  );
  const giorniSorted = useMemo(
    () => [...giorni].sort((a, b) => a.data.localeCompare(b.data)),
    [giorni],
  );

  async function fetchGiorniByViaggio(targetViaggioId: string): Promise<Giorno[]> {
    return getGiorniByViaggio(targetViaggioId);
  }

  useEffect(() => {
    let isActive = true;

    async function loadGiorni(): Promise<void> {
      try {
        const [records, prenotazioni] = await Promise.all([
          fetchGiorniByViaggio(viaggioId),
          getPrenotazioniByViaggio(viaggioId),
        ]);
        if (isActive) {
          setGiorni(records);
          setHotelOptions(prenotazioni.filter((prenotazione) => prenotazione.tipo === "HOTEL"));
        }
      } catch (loadError) {
        if (isActive) {
          const message =
            loadError instanceof Error ? loadError.message : "Errore caricamento giorni";
          setError(message);
        }
      }
    }

    void loadGiorni();

    return () => {
      isActive = false;
    };
  }, [viaggioId]);

  useEffect(() => {
    if (!menuOpenForDayId) {
      return;
    }

    const handleDocumentClick = (): void => {
      setMenuOpenForDayId(null);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMenuOpenForDayId(null);
        setEditTitleDay(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpenForDayId]);

  async function handleNuovoGiorno(): Promise<void> {
    if (!data) {
      setError("Inserisci la data del giorno.");
      return;
    }

    const plannedMapsUrlTrimmed = plannedMapsUrl.trim();
    if (plannedMapsUrlTrimmed && !plannedMapsUrlTrimmed.toLowerCase().startsWith("http")) {
      setError("Il link Google Maps deve iniziare con http.");
      return;
    }

    const nuovoGiorno: Giorno = {
      id: generateId(),
      viaggioId,
      data,
      titolo: titolo.trim(),
      stato,
      hotelPrenotazioneId: hotelPrenotazioneId || undefined,
      plannedMapsUrl: plannedMapsUrlTrimmed || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveGiorno(nuovoGiorno);
      const records = await fetchGiorniByViaggio(viaggioId);
      setGiorni(records);
      setData(todayDate());
      setTitolo("");
      setStato("PIANIFICATO");
      setHotelPrenotazioneId("");
      setPlannedMapsUrl("");
      setShowForm(false);
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Errore salvataggio giorno";
      setError(message);
    }
  }

  async function handleDeleteGiorno(giornoId: string): Promise<void> {
    const confirmed = window.confirm("Eliminare questo giorno e tutti i dati collegati?");
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await deleteTrackPointsByGiornoId(giornoId);
      await deleteGpxFilesByGiornoId(giornoId);
      await deleteGiorno(giornoId);
      const records = await fetchGiorniByViaggio(viaggioId);
      setGiorni(records);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore eliminazione giorno";
      setError(message);
    }
  }

  function openEditTitleModal(giorno: Giorno): void {
    setMenuOpenForDayId(null);
    setEditTitleDay(giorno);
    setEditTitleValue(giorno.titolo ?? "");
    setError(null);
  }

  async function handleSaveGiornoTitle(): Promise<void> {
    if (!editTitleDay) {
      return;
    }

    const updatedDay: Giorno = {
      ...editTitleDay,
      titolo: editTitleValue.trim(),
    };

    try {
      await saveGiorno(updatedDay);
      const records = await fetchGiorniByViaggio(viaggioId);
      setGiorni(records);
      setEditTitleDay(null);
      setEditTitleValue("");
      setError(null);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Errore aggiornamento titolo giorno";
      setError(message);
    }
  }

  const content = (
    <>
      <div className="card" style={{ padding: "0.85rem", marginBottom: "1rem" }}>
        <div className="toolbar" style={{ marginBottom: showForm ? "0.75rem" : 0 }}>
          <button type="button" onClick={() => setShowForm((current) => !current)} className="buttonPrimary">
            {showForm ? "Chiudi form" : "Nuovo giorno"}
          </button>
        </div>

        {showForm && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.65rem",
              }}
            >
              <input
                type="date"
                value={data}
                onChange={(event) => setData(event.target.value)}
                className="inputField"
              />
              <input
                type="text"
                value={titolo}
                onChange={(event) => setTitolo(event.target.value)}
                placeholder="Titolo giorno"
                className="inputField"
              />
              <select
                value={stato}
                onChange={(event) => setStato(event.target.value as Giorno["stato"])}
                className="inputField"
              >
                <option value="PIANIFICATO">Pianificato</option>
                <option value="IN_CORSO">In corso</option>
                <option value="FATTO">Fatto</option>
              </select>
              <select
                value={hotelPrenotazioneId}
                onChange={(event) => setHotelPrenotazioneId(event.target.value)}
                className="inputField"
              >
                <option value="">Hotel del giorno (opzionale)</option>
                {hotelOptions.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.titolo}
                    {hotel.localita ? ` - ${hotel.localita}` : ""}
                  </option>
                ))}
              </select>
              <input
                type="url"
                value={plannedMapsUrl}
                onChange={(event) => setPlannedMapsUrl(event.target.value)}
                placeholder="Link pianificazione Google Maps"
                className="inputField"
              />
            </div>
            <div style={{ marginTop: "0.8rem" }}>
              <button type="button" onClick={() => void handleNuovoGiorno()} className="buttonPrimary">
                Salva giorno
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="errorText">{error}</p>}
      {giorni.length === 0 && <p className="metaText">Nessun giorno presente.</p>}

      {giorniSorted.length > 0 && (
        <ul className="listPlain cardsGrid">
          {giorniSorted.map((giorno, index) => {
            const hotelDelGiorno =
              giorno.hotelPrenotazioneId ? hotelById.get(giorno.hotelPrenotazioneId) : undefined;
            const sequenceSummary = buildSequenceSummary(giorno);
            const visibleSummaryPills = sequenceSummary.slice(0, 3);
            const hiddenSummaryCount = Math.max(0, sequenceSummary.length - visibleSummaryPills.length);
            return (
              <li
                key={giorno.id}
                className="card detailCard"
                style={{
                  position: "relative",
                  padding: "0.35rem",
                  borderColor: "#243041",
                  boxShadow: "inset 0 0 0 1px rgba(31,111,235,0.08)",
                }}
              >
              <div
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                style={{
                  position: "absolute",
                  top: "0.6rem",
                  right: "0.6rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  zIndex: 3,
                }}
              >
                <button
                  type="button"
                  aria-label="Azioni giorno"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenuOpenForDayId((current) => (current === giorno.id ? null : giorno.id));
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: "1px solid #2A3445",
                    background: "#111827",
                    color: "#FFFFFF",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                    display: "grid",
                    placeItems: "center",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = "#1F6FEB";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = "#2A3445";
                  }}
                >
                  {"\u22ef"}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDeleteGiorno(giorno.id);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  aria-label="Cancella giorno"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: "1px solid #E11D48",
                    background: "rgba(225,29,72,0.15)",
                    color: "#E11D48",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                    display: "grid",
                    placeItems: "center",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.28)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.15)";
                  }}
                >
                  {"\u2715"}
                </button>
              </div>
              {menuOpenForDayId === giorno.id && (
                <div
                  className="card"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  style={{
                    position: "absolute",
                    top: "3.15rem",
                    right: "0.6rem",
                    minWidth: 170,
                    padding: "0.35rem",
                    zIndex: 3,
                    border: "1px solid #2A3445",
                  }}
                >
                  <button
                    type="button"
                    className="itemButton"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openEditTitleModal(giorno);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    Modifica titolo
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpenGiorno(giorno.id)}
                className="itemButton"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.95rem 6.7rem 0.95rem 0.95rem",
                  borderRadius: 14,
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 150px) 1fr",
                  gap: "0.9rem",
                  alignItems: "start",
                }}
              >
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <span
                    className="badge"
                    style={{
                      width: "fit-content",
                      borderColor: "#1F6FEB",
                      color: "#CFE2FF",
                      background: "rgba(31,111,235,0.14)",
                    }}
                  >
                    Giorno {index + 1}
                  </span>
                  <strong style={{ fontSize: "1.05rem", lineHeight: 1.2 }}>{formatDate(giorno.data)}</strong>
                </div>
                <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 700,
                        fontSize: "1rem",
                        letterSpacing: "0.02em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        minWidth: 0,
                        flex: "1 1 220px",
                      }}
                    >
                      {giorno.titolo.trim() ? giorno.titolo : "SENZA TITOLO"}
                    </p>
                    <span
                      className="badge"
                      style={{
                        whiteSpace: "nowrap",
                        alignSelf: "flex-start",
                        marginRight: "0.1rem",
                      }}
                    >
                      {statoGiornoLabel(giorno.stato)}
                    </span>
                  </div>
                  {hotelDelGiorno && (
                    <p className="metaText" style={{ margin: 0 }}>
                      Hotel: {hotelDelGiorno.titolo}
                    </p>
                  )}
                  {sequenceSummary.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.35rem",
                        marginTop: "0.2rem",
                      }}
                    >
                      {visibleSummaryPills.map((pill, pillIndex) => (
                        <span
                          key={`${giorno.id}-seq-${pillIndex}`}
                          className="badge"
                          style={{
                            borderColor: "#2A3445",
                            color: "#BFD4F4",
                            background: "rgba(148,163,184,0.12)",
                          }}
                        >
                          {pill}
                        </span>
                      ))}
                      {hiddenSummaryCount > 0 && (
                        <span
                          className="badge"
                          style={{
                            borderColor: "#2A3445",
                            color: "#BFD4F4",
                            background: "rgba(148,163,184,0.12)",
                          }}
                        >
                          +{hiddenSummaryCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
              </li>
            );
          })}
        </ul>
      )}

      {editTitleDay && (
        <div
          onClick={() => setEditTitleDay(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11,18,32,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            className="card detailCard"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, padding: "1rem" }}
          >
            <h3 style={{ margin: "0 0 0.75rem 0" }}>Modifica titolo giorno</h3>
            <input
              type="text"
              value={editTitleValue}
              onChange={(event) => setEditTitleValue(event.target.value)}
              className="inputField"
              placeholder="Titolo giorno"
              autoFocus
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                marginTop: "0.85rem",
                flexWrap: "wrap",
              }}
            >
              <button type="button" className="buttonGhost" onClick={() => setEditTitleDay(null)}>
                Annulla
              </button>
              <button type="button" className="buttonPrimary" onClick={() => void handleSaveGiornoTitle()}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="toolbar">
          {onBack && (
            <button type="button" onClick={onBack} className="buttonGhost">
              {"\u2190"} Viaggi
            </button>
          )}
          <h1 className="pageTitle">Giorni</h1>
        </div>
        {content}
      </div>
    </main>
  );
}
