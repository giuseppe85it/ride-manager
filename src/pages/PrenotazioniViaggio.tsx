import { useEffect, useMemo, useState } from "react";
import type { Prenotazione, PrenotazioneStato, PrenotazioneTipo } from "../models/Prenotazione";
import { deletePrenotazione, getPrenotazioniByViaggio } from "../services/storage";
import PrenotazioneFormModal from "./PrenotazioneFormModal";
import "./PrenotazioniViaggio.css";
import "../styles/theme.css";

interface PrenotazioniViaggioProps {
  viaggioId: string;
}

type TipoFiltro = "ALL" | PrenotazioneTipo;
type StatoFiltro = "ALL" | PrenotazioneStato;

function formatDateTime(iso?: string, explicitTime?: string): string {
  if (!iso) {
    return "\u2014";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "\u2014";
  }

  const datePart = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);

  if (explicitTime) {
    return `${datePart} ${explicitTime}`;
  }

  const timePart = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);

  return `${datePart} ${timePart}`;
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "\u2014";
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function statoLabel(stato: PrenotazioneStato): string {
  if (stato === "CONFERMATA") return "Confermata";
  if (stato === "CANCELLATA") return "Cancellata";
  return "Opzione";
}

function tipoLabel(tipo: PrenotazioneTipo): string {
  return tipo === "HOTEL" ? "Hotel" : "Traghetto";
}

export default function PrenotazioniViaggio({ viaggioId }: PrenotazioniViaggioProps) {
  const [prenotazioni, setPrenotazioni] = useState<Prenotazione[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("ALL");
  const [statoFiltro, setStatoFiltro] = useState<StatoFiltro>("ALL");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrenotazione, setEditingPrenotazione] = useState<Prenotazione | null>(null);

  async function loadPrenotazioni(): Promise<void> {
    try {
      setIsLoading(true);
      const records = await getPrenotazioniByViaggio(viaggioId);
      setPrenotazioni(records);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Errore caricamento prenotazioni";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPrenotazioni();
  }, [viaggioId]);

  const prenotazioniFiltrate = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return [...prenotazioni]
      .filter((prenotazione) => (tipoFiltro === "ALL" ? true : prenotazione.tipo === tipoFiltro))
      .filter((prenotazione) => (statoFiltro === "ALL" ? true : prenotazione.stato === statoFiltro))
      .filter((prenotazione) => {
        if (!searchText) {
          return true;
        }

        const haystack = [
          prenotazione.titolo,
          prenotazione.fornitore,
          prenotazione.localita,
          prenotazione.numeroPrenotazione,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchText);
      })
      .sort((left, right) => {
        const leftMs = Date.parse(left.dataInizio);
        const rightMs = Date.parse(right.dataInizio);
        if (Number.isNaN(leftMs) && Number.isNaN(rightMs)) return 0;
        if (Number.isNaN(leftMs)) return 1;
        if (Number.isNaN(rightMs)) return -1;
        return leftMs - rightMs;
      });
  }, [prenotazioni, tipoFiltro, statoFiltro, search]);

  async function handleDelete(id: string): Promise<void> {
    const confirmed = window.confirm("Eliminare questa prenotazione?");
    if (!confirmed) {
      return;
    }

    try {
      await deletePrenotazione(id);
      await loadPrenotazioni();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Errore eliminazione prenotazione";
      setError(message);
    }
  }

  async function handleCopyNumero(numeroPrenotazione: string): Promise<void> {
    if (!numeroPrenotazione) {
      return;
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(numeroPrenotazione);
        return;
      }
      window.prompt("Copia numero prenotazione:", numeroPrenotazione);
    } catch {
      window.prompt("Copia numero prenotazione:", numeroPrenotazione);
    }
  }

  return (
    <section className="card detailCard prenPage">
      <div className="prenToolbar">
        <h2 style={{ margin: 0 }}>Prenotazioni</h2>
        <button
          type="button"
          className="buttonPrimary"
          onClick={() => {
            setEditingPrenotazione(null);
            setIsModalOpen(true);
          }}
        >
          Nuova prenotazione
        </button>
      </div>

      <div className="prenFilters">
        <div className="prenFilterGroup">
          <button
            type="button"
            className={tipoFiltro === "ALL" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setTipoFiltro("ALL")}
          >
            Tutte
          </button>
          <button
            type="button"
            className={tipoFiltro === "HOTEL" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setTipoFiltro("HOTEL")}
          >
            Hotel
          </button>
          <button
            type="button"
            className={tipoFiltro === "TRAGHETTO" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setTipoFiltro("TRAGHETTO")}
          >
            Traghetti
          </button>
        </div>

        <div className="prenFilterGroup">
          <button
            type="button"
            className={statoFiltro === "ALL" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setStatoFiltro("ALL")}
          >
            Tutte
          </button>
          <button
            type="button"
            className={statoFiltro === "OPZIONE" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setStatoFiltro("OPZIONE")}
          >
            Opzione
          </button>
          <button
            type="button"
            className={statoFiltro === "CONFERMATA" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setStatoFiltro("CONFERMATA")}
          >
            Confermate
          </button>
          <button
            type="button"
            className={statoFiltro === "CANCELLATA" ? "buttonPrimary" : "buttonGhost"}
            onClick={() => setStatoFiltro("CANCELLATA")}
          >
            Cancellate
          </button>
        </div>

        <input
          className="inputField"
          type="text"
          placeholder="Cerca titolo, fornitore, localita, numero..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isLoading && <p className="metaText">Caricamento prenotazioni...</p>}
      {!isLoading && error && <p className="errorText">{error}</p>}
      {!isLoading && !error && prenotazioniFiltrate.length === 0 && (
        <p className="metaText">Nessuna prenotazione trovata.</p>
      )}

      {!isLoading && !error && prenotazioniFiltrate.length > 0 && (
        <ul className="listPlain cardsGrid">
          {prenotazioniFiltrate.map((prenotazione) => (
            <li key={prenotazione.id} className="card prenCard">
              <div className="prenCardHeader">
                <div className="prenBadgeRow">
                  <span className="badge">{tipoLabel(prenotazione.tipo)}</span>
                  <span className={`prenStato prenStato-${prenotazione.stato.toLowerCase()}`}>
                    {statoLabel(prenotazione.stato)}
                  </span>
                </div>
                <strong>{prenotazione.titolo}</strong>
              </div>

              {prenotazione.localita && (
                <p className="metaText" style={{ margin: "0.2rem 0 0.35rem 0" }}>
                  {prenotazione.localita}
                </p>
              )}

              <p className="metaText" style={{ margin: "0.2rem 0" }}>
                Inizio: {formatDateTime(prenotazione.dataInizio, prenotazione.oraInizio)}
              </p>
              <p className="metaText" style={{ margin: "0.2rem 0" }}>
                Fine: {formatDateTime(prenotazione.dataFine, prenotazione.oraFine)}
              </p>

              {typeof prenotazione.costoTotale === "number" && (
                <p className="metaText" style={{ margin: "0.35rem 0" }}>
                  Costo: {formatCurrency(prenotazione.costoTotale)}
                </p>
              )}

              <div className="prenActions">
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => {
                    setEditingPrenotazione(prenotazione);
                    setIsModalOpen(true);
                  }}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void handleDelete(prenotazione.id)}
                >
                  Elimina
                </button>
                {prenotazione.url && (
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() => window.open(prenotazione.url, "_blank", "noopener,noreferrer")}
                  >
                    Apri link
                  </button>
                )}
                {prenotazione.numeroPrenotazione && (
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() => void handleCopyNumero(prenotazione.numeroPrenotazione ?? "")}
                  >
                    Copia numero
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <PrenotazioneFormModal
        isOpen={isModalOpen}
        viaggioId={viaggioId}
        initialPrenotazione={editingPrenotazione}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => void loadPrenotazioni()}
      />
    </section>
  );
}
