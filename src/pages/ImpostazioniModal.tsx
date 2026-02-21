import { useEffect, useMemo, useState } from "react";
import type { ImpostazioniApp, Partecipante } from "../models/ImpostazioniApp";
import { getImpostazioniApp, saveImpostazioniApp } from "../services/storage";
import "../styles/theme.css";

interface ImpostazioniModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (data: ImpostazioniApp) => void;
}

function createDefaultDraft(): Partecipante[] {
  return [
    { id: "p1", nome: "" },
    { id: "p2", nome: "" },
  ];
}

function createParticipantId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ImpostazioniModal({ isOpen, onClose, onSaved }: ImpostazioniModalProps) {
  const [draft, setDraft] = useState<Partecipante[]>(createDefaultDraft());
  const [initialData, setInitialData] = useState<ImpostazioniApp | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;

    async function loadSettings(): Promise<void> {
      try {
        setIsLoading(true);
        const current = await getImpostazioniApp();
        if (!isActive) {
          return;
        }

        setInitialData(current);
        if (current && current.partecipanti.length > 0) {
          setDraft(current.partecipanti.map((item) => ({ ...item })));
        } else {
          setDraft(createDefaultDraft());
        }
        setError(null);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : "Errore caricamento impostazioni";
        setError(message);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [isOpen]);

  const partecipantiCount = useMemo(() => draft.length, [draft]);

  if (!isOpen) {
    return null;
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const payload: ImpostazioniApp = {
        id: "app",
        partecipanti: draft.map((item) => ({
          id: item.id,
          nome: item.nome.trim(),
        })),
        createdAt: initialData?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      await saveImpostazioniApp(payload);
      onSaved(payload);
      onClose();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Errore salvataggio impostazioni";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 58%)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem" }}>
          <h2 style={{ margin: 0 }}>Impostazioni</h2>
          <button type="button" className="buttonGhost" onClick={onClose}>
            {"\u2715"}
          </button>
        </div>

        <p className="metaText" style={{ margin: "0.65rem 0 0.35rem 0" }}>
          Partecipanti ({partecipantiCount})
        </p>

        {draft.length > 2 && (
          <p className="metaText" style={{ margin: "0.35rem 0", color: "#fbbf24" }}>
            Divisione spese attuale supporta 2 partecipanti; gli altri verranno usati in futuro.
          </p>
        )}

        {error && <p className="errorText">{error}</p>}
        {isLoading && <p className="metaText">Caricamento impostazioni...</p>}

        {!isLoading && (
          <>
            <ul className="listPlain" style={{ marginTop: "0.7rem" }}>
              {draft.map((item, index) => (
                <li
                  key={item.id}
                  className="card"
                  style={{
                    padding: "0.7rem",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <input
                    className="inputField"
                    type="text"
                    placeholder={index === 0 ? "Nome 1" : index === 1 ? "Nome 2" : `Nome ${index + 1}`}
                    value={item.nome}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, nome: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() =>
                      setDraft((current) =>
                        current.length > 1 ? current.filter((entry) => entry.id !== item.id) : current,
                      )
                    }
                    aria-label={`Rimuovi partecipante ${index + 1}`}
                    title="Rimuovi"
                  >
                    {"\u2715"}
                  </button>
                </li>
              ))}
            </ul>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.55rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
              <button
                type="button"
                className="buttonGhost"
                onClick={() =>
                  setDraft((current) => [...current, { id: createParticipantId(), nome: "" }])
                }
              >
                + Aggiungi partecipante
              </button>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="buttonGhost" onClick={onClose} disabled={isSaving}>
                  Annulla
                </button>
                <button
                  type="button"
                  className="buttonPrimary"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
