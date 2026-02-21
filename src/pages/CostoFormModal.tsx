import { useEffect, useState } from "react";
import type { Costo, CostoCategoria, CostoPagatoDa } from "../models/Costo";
import type { Giorno } from "../models/Giorno";
import { deleteCosto, getGiorniByViaggio, saveCosto } from "../services/storage";
import "../styles/theme.css";

interface CostoFormModalProps {
  isOpen: boolean;
  viaggioId: string;
  initialCosto?: Costo | null;
  onClose: () => void;
  onSaved: () => void;
}

interface CostoFormState {
  giornoId: string;
  categoria: CostoCategoria;
  titolo: string;
  data: string;
  ora: string;
  importo: string;
  pagatoDa: CostoPagatoDa;
  quotaIo: string;
  quotaLei: string;
  note: string;
}

function toDateInput(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function numberToString(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoDate(value: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function buildInitialState(costo?: Costo | null): CostoFormState {
  return {
    giornoId: costo?.giornoId ?? "",
    categoria: costo?.categoria ?? "BENZINA",
    titolo: costo?.titolo ?? "",
    data: toDateInput(costo?.data),
    ora: costo?.ora ?? "",
    importo: numberToString(costo?.importo),
    pagatoDa: costo?.pagatoDa ?? "IO",
    quotaIo: numberToString(costo?.quotaIo),
    quotaLei: numberToString(costo?.quotaLei),
    note: costo?.note ?? "",
  };
}

function formatDayOption(giorno: Giorno): string {
  return `${giorno.data} - ${giorno.titolo.trim() ? giorno.titolo : "Senza titolo"}`;
}

export default function CostoFormModal({
  isOpen,
  viaggioId,
  initialCosto,
  onClose,
  onSaved,
}: CostoFormModalProps) {
  const [giorni, setGiorni] = useState<Giorno[]>([]);
  const [form, setForm] = useState<CostoFormState>(buildInitialState(initialCosto));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setForm(buildInitialState(initialCosto));
    setError(null);
  }, [isOpen, initialCosto]);

  useEffect(() => {
    if (!isOpen) return;

    let isActive = true;

    async function loadGiorni(): Promise<void> {
      try {
        const records = await getGiorniByViaggio(viaggioId);
        if (isActive) {
          setGiorni([...records].sort((left, right) => left.data.localeCompare(right.data)));
        }
      } catch (loadError) {
        if (isActive) {
          const message = loadError instanceof Error ? loadError.message : "Errore caricamento giorni";
          setError(message);
        }
      }
    }

    void loadGiorni();
    return () => {
      isActive = false;
    };
  }, [isOpen, viaggioId]);

  if (!isOpen) return null;

  async function handleSave(): Promise<void> {
    const titolo = form.titolo.trim();
    if (!titolo) {
      setError("Titolo obbligatorio.");
      return;
    }

    const dataIso = toIsoDate(form.data);
    if (!dataIso) {
      setError("Data obbligatoria e valida.");
      return;
    }

    const importo = toOptionalNumber(form.importo);
    if (importo === undefined || importo <= 0) {
      setError("Importo deve essere maggiore di zero.");
      return;
    }

    const quotaIo = toOptionalNumber(form.quotaIo);
    const quotaLei = toOptionalNumber(form.quotaLei);

    if (form.pagatoDa === "DIVISO") {
      if (quotaIo === undefined || quotaLei === undefined) {
        setError("Per DIVISO inserisci quota IO e quota LEI.");
        return;
      }

      const diff = Math.abs(quotaIo + quotaLei - importo);
      if (diff > 0.01) {
        setError("Quota IO + quota LEI deve essere uguale all'importo.");
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const payload: Costo = {
        id:
          initialCosto?.id ??
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `costo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`),
        viaggioId,
        giornoId: toOptionalString(form.giornoId),
        categoria: form.categoria,
        titolo,
        data: dataIso,
        ora: toOptionalString(form.ora),
        valuta: "EUR",
        importo,
        pagatoDa: form.pagatoDa,
        quotaIo: form.pagatoDa === "DIVISO" ? quotaIo : undefined,
        quotaLei: form.pagatoDa === "DIVISO" ? quotaLei : undefined,
        note: toOptionalString(form.note),
        createdAt: initialCosto?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      await saveCosto(payload);
      onSaved();
      onClose();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Errore salvataggio costo";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!initialCosto) return;
    const confirmed = window.confirm("Eliminare questo costo?");
    if (!confirmed) return;

    try {
      await deleteCosto(initialCosto.id);
      onSaved();
      onClose();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore eliminazione costo";
      setError(message);
    }
  }

  return (
    <div className="costiModalOverlay" onClick={onClose}>
      <div className="costiModal card" onClick={(event) => event.stopPropagation()}>
        <div className="costiModalHeader">
          <h2 style={{ margin: 0 }}>{initialCosto ? "Modifica costo" : "Nuovo costo"}</h2>
          <button type="button" className="buttonGhost" onClick={onClose}>
            {"\u2715"}
          </button>
        </div>

        {error && <p className="errorText">{error}</p>}

        <div className="costiGrid">
          <select
            className="inputField"
            value={form.categoria}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                categoria: event.target.value as CostoCategoria,
              }))
            }
          >
            <option value="BENZINA">BENZINA</option>
            <option value="HOTEL">HOTEL</option>
            <option value="TRAGHETTI">TRAGHETTI</option>
            <option value="EXTRA">EXTRA</option>
          </select>

          <select
            className="inputField"
            value={form.pagatoDa}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                pagatoDa: event.target.value as CostoPagatoDa,
              }))
            }
          >
            <option value="IO">IO</option>
            <option value="LEI">LEI</option>
            <option value="DIVISO">DIVISO</option>
          </select>

          <input
            className="inputField costiCol2"
            type="text"
            placeholder="Titolo"
            value={form.titolo}
            onChange={(event) => setForm((current) => ({ ...current, titolo: event.target.value }))}
          />

          <input
            className="inputField"
            type="date"
            value={form.data}
            onChange={(event) => setForm((current) => ({ ...current, data: event.target.value }))}
          />

          <input
            className="inputField"
            type="time"
            value={form.ora}
            onChange={(event) => setForm((current) => ({ ...current, ora: event.target.value }))}
          />

          <input
            className="inputField"
            type="number"
            min={0}
            step="0.01"
            placeholder="Importo"
            value={form.importo}
            onChange={(event) => setForm((current) => ({ ...current, importo: event.target.value }))}
          />

          <select
            className="inputField"
            value={form.giornoId}
            onChange={(event) => setForm((current) => ({ ...current, giornoId: event.target.value }))}
          >
            <option value="">Non collegato a un giorno</option>
            {giorni.map((giorno) => (
              <option key={giorno.id} value={giorno.id}>
                {formatDayOption(giorno)}
              </option>
            ))}
          </select>

          {form.pagatoDa === "DIVISO" && (
            <>
              <input
                className="inputField"
                type="number"
                min={0}
                step="0.01"
                placeholder="Quota IO"
                value={form.quotaIo}
                onChange={(event) => setForm((current) => ({ ...current, quotaIo: event.target.value }))}
              />
              <input
                className="inputField"
                type="number"
                min={0}
                step="0.01"
                placeholder="Quota LEI"
                value={form.quotaLei}
                onChange={(event) => setForm((current) => ({ ...current, quotaLei: event.target.value }))}
              />
            </>
          )}

          <textarea
            className="inputField costiCol2"
            rows={4}
            placeholder="Note"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
        </div>

        <div className="costiModalFooter">
          {initialCosto && (
            <button type="button" className="buttonGhost" onClick={() => void handleDelete()} disabled={isSaving}>
              Elimina
            </button>
          )}
          <button type="button" className="buttonGhost" onClick={onClose} disabled={isSaving}>
            Annulla
          </button>
          <button type="button" className="buttonPrimary" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
