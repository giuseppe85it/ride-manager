import { useEffect, useState } from "react";
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

      {giorni.length > 0 && (
        <ul className="listPlain cardsGrid">
          {giorni.map((giorno) => (
            <li key={giorno.id} className="card detailCard" style={{ position: "relative", padding: "0.25rem" }}>
              <button
                type="button"
                onClick={() => void handleDeleteGiorno(giorno.id)}
                aria-label="Cancella giorno"
                style={{
                  position: "absolute",
                  top: "0.55rem",
                  right: "0.55rem",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  border: "1px solid #E11D48",
                  background: "rgba(225,29,72,0.15)",
                  color: "#E11D48",
                  cursor: "pointer",
                  fontSize: "1rem",
                  lineHeight: 1,
                  zIndex: 1,
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
              <button
                type="button"
                onClick={() => onOpenGiorno(giorno.id)}
                className="itemButton"
                style={{ paddingRight: "3rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                  <strong>{formatDate(giorno.data)}</strong>
                  <span className="badge">{statoGiornoLabel(giorno.stato)}</span>
                </div>
                <p style={{ margin: "0.55rem 0 0", fontWeight: 600 }}>
                  {giorno.titolo.trim() ? giorno.titolo : "Senza titolo"}
                </p>
              </button>
            </li>
          ))}
        </ul>
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
