import { useEffect, useState } from "react";
import type { Viaggio } from "../models/Viaggio";
import { getViaggi, saveViaggio } from "../services/storage";
import "../styles/theme.css";

interface ViaggiProps {
  onBackHome: () => void;
  onOpenViaggio: (viaggioId: string) => void;
}

function generateId(prefix = "viaggio"): string {
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

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function statoViaggioLabel(stato: Viaggio["stato"]): string {
  if (stato === "PIANIFICAZIONE") return "Pianificazione";
  if (stato === "ATTIVO") return "Attivo";
  if (stato === "CONCLUSO") return "Concluso";
  return "Archiviato";
}

export default function Viaggi({ onBackHome, onOpenViaggio }: ViaggiProps) {
  const [viaggi, setViaggi] = useState<Viaggio[]>([]);
  const [nome, setNome] = useState("");
  const [dataInizio, setDataInizio] = useState(todayDate());
  const [dataFine, setDataFine] = useState(todayDate());
  const [area, setArea] = useState("");
  const [stato, setStato] = useState<Viaggio["stato"]>("PIANIFICAZIONE");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadViaggi(): Promise<void> {
      try {
        const records = await getViaggi();
        if (isActive) {
          setViaggi(records);
        }
      } catch (loadError) {
        if (isActive) {
          const message =
            loadError instanceof Error ? loadError.message : "Errore caricamento viaggi";
          setError(message);
        }
      }
    }

    void loadViaggi();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleNuovoViaggio(): Promise<void> {
    const nomePulito = nome.trim();
    if (!nomePulito) {
      setError("Inserisci il nome viaggio.");
      return;
    }

    if (!dataInizio || !dataFine) {
      setError("Inserisci data inizio e data fine.");
      return;
    }

    if (dataFine < dataInizio) {
      setError("La data fine non puo' essere precedente alla data inizio.");
      return;
    }

    const nuovoViaggio: Viaggio = {
      id: generateId(),
      nome: nomePulito,
      dataInizio,
      dataFine,
      area: area.trim(),
      valuta: "EUR",
      stato,
      note: note.trim() ? note.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveViaggio(nuovoViaggio);
      setViaggi((current) => [nuovoViaggio, ...current]);
      setNome("");
      setDataInizio(todayDate());
      setDataFine(todayDate());
      setArea("");
      setStato("PIANIFICAZIONE");
      setNote("");
      setShowForm(false);
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Errore salvataggio viaggio";
      setError(message);
    }
  }

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="toolbar">
          <button type="button" onClick={onBackHome} className="buttonGhost">
            {"\u2190"} Dashboard
          </button>
          <h1 className="pageTitle">Viaggi</h1>
        </div>

        <div className="card" style={{ padding: "0.85rem", marginBottom: "1rem" }}>
          <div className="toolbar" style={{ marginBottom: showForm ? "0.85rem" : 0 }}>
            <button type="button" onClick={() => setShowForm((current) => !current)} className="buttonPrimary">
              {showForm ? "Chiudi form" : "Nuovo viaggio"}
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
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  placeholder="Nome viaggio"
                  className="inputField"
                />
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(event) => setDataInizio(event.target.value)}
                  className="inputField"
                />
                <input
                  type="date"
                  value={dataFine}
                  onChange={(event) => setDataFine(event.target.value)}
                  className="inputField"
                />
                <input
                  type="text"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Area / Paesi"
                  className="inputField"
                />
                <select
                  value={stato}
                  onChange={(event) => setStato(event.target.value as Viaggio["stato"])}
                  className="inputField"
                >
                  <option value="PIANIFICAZIONE">Pianificazione</option>
                  <option value="ATTIVO">Attivo</option>
                  <option value="CONCLUSO">Concluso</option>
                  <option value="ARCHIVIATO">Archiviato</option>
                </select>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Note (opzionale)"
                  className="inputField"
                />
              </div>
              <div style={{ marginTop: "0.8rem" }}>
                <button type="button" onClick={() => void handleNuovoViaggio()} className="buttonPrimary">
                  Salva viaggio
                </button>
              </div>
            </>
          )}
        </div>

        {error && <p className="errorText">{error}</p>}
        {viaggi.length === 0 && <p className="metaText">Nessun viaggio presente.</p>}

        {viaggi.length > 0 && (
          <ul className="listPlain cardsGrid">
            {viaggi.map((viaggio) => (
              <li key={viaggio.id} className="card detailCard">
                <button type="button" onClick={() => onOpenViaggio(viaggio.id)} className="itemButton">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "1.1rem" }}>{viaggio.nome}</strong>
                    <span className="badge">{statoViaggioLabel(viaggio.stato)}</span>
                  </div>
                  <p className="metaText" style={{ margin: "0.55rem 0 0.25rem 0" }}>
                    Date: {formatDate(viaggio.dataInizio)} {"\u2192"} {formatDate(viaggio.dataFine)}
                  </p>
                  {viaggio.area && (
                    <p className="metaText" style={{ margin: 0 }}>
                      Area: {viaggio.area}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
