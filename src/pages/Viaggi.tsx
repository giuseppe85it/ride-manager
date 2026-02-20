import { useEffect, useState } from "react";
import type { Viaggio } from "../models/Viaggio";
import { deleteViaggioCascade, getViaggi, saveViaggio } from "../services/storage";
import "./Viaggi.css";
import "../styles/theme.css";

interface ViaggiProps {
  onBackHome: () => void;
  onOpenViaggio: (viaggioId: string) => void;
}

interface ViaggioDraft {
  nome: string;
  dataInizio: string;
  dataFine: string;
  area: string;
  stato: Viaggio["stato"];
  note: string;
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

function toDraft(viaggio?: Viaggio): ViaggioDraft {
  return {
    nome: viaggio?.nome ?? "",
    dataInizio: viaggio?.dataInizio ?? todayDate(),
    dataFine: viaggio?.dataFine ?? todayDate(),
    area: viaggio?.area ?? "",
    stato: viaggio?.stato ?? "PIANIFICAZIONE",
    note: viaggio?.note ?? "",
  };
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(parsed));
}

function statoViaggioLabel(stato: Viaggio["stato"]): string {
  if (stato === "PIANIFICAZIONE") return "Pianificazione";
  if (stato === "ATTIVO") return "Attivo";
  if (stato === "CONCLUSO") return "Concluso";
  return "Archiviato";
}

function validateDraft(draft: ViaggioDraft): string | null {
  if (!draft.nome.trim()) {
    return "Inserisci il nome viaggio.";
  }

  const startMs = Date.parse(draft.dataInizio);
  const endMs = Date.parse(draft.dataFine);

  if (Number.isNaN(startMs)) {
    return "Data inizio non valida.";
  }

  if (Number.isNaN(endMs)) {
    return "Data fine non valida.";
  }

  if (endMs < startMs) {
    return "La data fine non puo' essere precedente alla data inizio.";
  }

  return null;
}

export default function Viaggi({ onBackHome, onOpenViaggio }: ViaggiProps) {
  const [viaggi, setViaggi] = useState<Viaggio[]>([]);
  const [createDraft, setCreateDraft] = useState<ViaggioDraft>(toDraft());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuTripId, setOpenMenuTripId] = useState<string | null>(null);
  const [editingViaggio, setEditingViaggio] = useState<Viaggio | null>(null);
  const [editDraft, setEditDraft] = useState<ViaggioDraft>(toDraft());
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  async function reloadViaggi(): Promise<void> {
    const records = await getViaggi();
    setViaggi(records);
  }

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

  useEffect(() => {
    if (!openMenuTripId) {
      return;
    }

    function handleOutsideClick(event: MouseEvent): void {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".viaggiActionsWrap")) {
        setOpenMenuTripId(null);
      }
    }

    function handleEsc(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpenMenuTripId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [openMenuTripId]);

  async function handleNuovoViaggio(): Promise<void> {
    const validationError = validateDraft(createDraft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const nuovoViaggio: Viaggio = {
      id: generateId(),
      nome: createDraft.nome.trim(),
      dataInizio: createDraft.dataInizio,
      dataFine: createDraft.dataFine,
      area: createDraft.area.trim(),
      valuta: "EUR",
      stato: createDraft.stato,
      note: createDraft.note.trim() ? createDraft.note.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveViaggio(nuovoViaggio);
      await reloadViaggi();
      setCreateDraft(toDraft());
      setShowForm(false);
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Errore salvataggio viaggio";
      setError(message);
    }
  }

  function handleOpenEdit(viaggio: Viaggio): void {
    setOpenMenuTripId(null);
    setEditingViaggio(viaggio);
    setEditDraft(toDraft(viaggio));
    setError(null);
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingViaggio) {
      return;
    }

    const validationError = validateDraft(editDraft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const viaggioAggiornato: Viaggio = {
      ...editingViaggio,
      nome: editDraft.nome.trim(),
      dataInizio: editDraft.dataInizio,
      dataFine: editDraft.dataFine,
      area: editDraft.area.trim(),
      stato: editDraft.stato,
      note: editDraft.note.trim() ? editDraft.note.trim() : undefined,
      createdAt: editingViaggio.createdAt,
    };

    setIsSavingEdit(true);

    try {
      await saveViaggio(viaggioAggiornato);
      await reloadViaggi();
      setEditingViaggio(null);
      setError(null);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Errore aggiornamento viaggio";
      setError(message);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteViaggio(viaggioId: string): Promise<void> {
    setOpenMenuTripId(null);

    const confirmed = window.confirm(
      "Confermi eliminazione viaggio? Verranno eliminati anche giorni e tracce GPX."
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteViaggioCascade(viaggioId);
      await reloadViaggi();
      setError(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore eliminazione viaggio";
      setError(message);
    }
  }

  async function handleDuplicateViaggio(viaggio: Viaggio): Promise<void> {
    setOpenMenuTripId(null);

    const copia: Viaggio = {
      id: generateId(),
      nome: `Copia di ${viaggio.nome}`,
      dataInizio: viaggio.dataInizio,
      dataFine: viaggio.dataFine,
      area: viaggio.area,
      valuta: "EUR",
      stato: "PIANIFICAZIONE",
      note: viaggio.note,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveViaggio(copia);
      await reloadViaggi();
      setError(null);
    } catch (duplicateError) {
      const message = duplicateError instanceof Error ? duplicateError.message : "Errore duplicazione viaggio";
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
              <div className="viaggiFormGrid">
                <input
                  type="text"
                  value={createDraft.nome}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      nome: event.target.value,
                    }))
                  }
                  placeholder="Nome viaggio"
                  className="inputField"
                />
                <input
                  type="date"
                  value={createDraft.dataInizio}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      dataInizio: event.target.value,
                    }))
                  }
                  className="inputField"
                />
                <input
                  type="date"
                  value={createDraft.dataFine}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      dataFine: event.target.value,
                    }))
                  }
                  className="inputField"
                />
                <input
                  type="text"
                  value={createDraft.area}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      area: event.target.value,
                    }))
                  }
                  placeholder="Area / Paesi"
                  className="inputField"
                />
                <select
                  value={createDraft.stato}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      stato: event.target.value as Viaggio["stato"],
                    }))
                  }
                  className="inputField"
                >
                  <option value="PIANIFICAZIONE">Pianificazione</option>
                  <option value="ATTIVO">Attivo</option>
                  <option value="CONCLUSO">Concluso</option>
                  <option value="ARCHIVIATO">Archiviato</option>
                </select>
                <input
                  type="text"
                  value={createDraft.note}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
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
              <li key={viaggio.id} className="card detailCard viaggiCard">
                <div className="viaggiActionsWrap" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label="Azioni viaggio"
                    className="viaggiMenuButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuTripId((current) => (current === viaggio.id ? null : viaggio.id));
                    }}
                  >
                    {"\u22ef"}
                  </button>

                  {openMenuTripId === viaggio.id && (
                    <div className="viaggiDropdown" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => handleOpenEdit(viaggio)}>
                        Modifica
                      </button>
                      <button type="button" onClick={() => void handleDeleteViaggio(viaggio.id)}>
                        Elimina
                      </button>
                      <button type="button" onClick={() => void handleDuplicateViaggio(viaggio)}>
                        Duplica viaggio
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onOpenViaggio(viaggio.id)}
                  className="itemButton viaggiOpenButton"
                >
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

      {editingViaggio && (
        <div className="viaggiModalOverlay" onClick={() => setEditingViaggio(null)}>
          <div className="viaggiModal card" onClick={(event) => event.stopPropagation()}>
            <div className="viaggiModalHeader">
              <h2 style={{ margin: 0 }}>Modifica viaggio</h2>
              <button type="button" className="buttonGhost" onClick={() => setEditingViaggio(null)}>
                {"\u2715"}
              </button>
            </div>

            <div className="viaggiFormGrid">
              <input
                type="text"
                value={editDraft.nome}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    nome: event.target.value,
                  }))
                }
                placeholder="Nome viaggio"
                className="inputField"
              />
              <input
                type="date"
                value={editDraft.dataInizio}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    dataInizio: event.target.value,
                  }))
                }
                className="inputField"
              />
              <input
                type="date"
                value={editDraft.dataFine}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    dataFine: event.target.value,
                  }))
                }
                className="inputField"
              />
              <input
                type="text"
                value={editDraft.area}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
                placeholder="Area / Paesi"
                className="inputField"
              />
              <select
                value={editDraft.stato}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    stato: event.target.value as Viaggio["stato"],
                  }))
                }
                className="inputField"
              >
                <option value="PIANIFICAZIONE">Pianificazione</option>
                <option value="ATTIVO">Attivo</option>
                <option value="CONCLUSO">Concluso</option>
                <option value="ARCHIVIATO">Archiviato</option>
              </select>
              <input
                type="text"
                value={editDraft.note}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Note (opzionale)"
                className="inputField"
              />
            </div>

            <div className="viaggiModalFooter">
              <button
                type="button"
                className="buttonGhost"
                onClick={() => setEditingViaggio(null)}
                disabled={isSavingEdit}
              >
                Annulla
              </button>
              <button
                type="button"
                className="buttonPrimary"
                onClick={() => void handleSaveEdit()}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? "Salvataggio..." : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
