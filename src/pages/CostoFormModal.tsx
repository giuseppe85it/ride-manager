import { useEffect, useMemo, useState } from "react";
import type { Costo, CostoCategoria, CostoPagatoDa } from "../models/Costo";
import type { Giorno } from "../models/Giorno";
import { deleteCosto, getGiorniByViaggio, saveCosto } from "../services/storage";
import "../styles/theme.css";

interface CostoFormModalProps {
  isOpen: boolean;
  viaggioId: string;
  partecipantiViaggio?: string[];
  initialCosto?: Costo | null;
  mode?: "full" | "quick";
  quickPresetCategoria?: "BENZINA" | "PEDAGGI";
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
  litri: string;
  prezzoLitro: string;
  pagatoDa: string;
  quotaIo: string;
  quotaLei: string;
  note: string;
}

const DEFAULT_UI_PARTECIPANTI = ["Peppe", "Elvira"];

function toDateInput(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
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
    litri: numberToString(costo?.litri),
    prezzoLitro: numberToString(costo?.prezzoLitro),
    pagatoDa: costo?.pagatoDa ?? "IO",
    quotaIo: numberToString(costo?.quotaIo),
    quotaLei: numberToString(costo?.quotaLei),
    note: costo?.note ?? "",
  };
}

function formatDayOption(giorno: Giorno): string {
  return `${giorno.data} - ${giorno.titolo.trim() ? giorno.titolo : "Senza titolo"}`;
}

function normalizeTripParticipantsForUi(partecipanti?: string[]): string[] {
  const sanitized = (Array.isArray(partecipanti) ? partecipanti : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);

  return sanitized.length > 0 ? sanitized : [...DEFAULT_UI_PARTECIPANTI];
}

function getPayerLabels(partecipanti?: string[]): { labelIO: string; labelLEI: string } {
  const normalized = normalizeTripParticipantsForUi(partecipanti);
  const first = normalized[0]?.trim();
  const second = normalized[1]?.trim();
  return {
    labelIO: first ? first : "IO",
    labelLEI: second ? second : "LEI",
  };
}

export default function CostoFormModal({
  isOpen,
  viaggioId,
  partecipantiViaggio,
  initialCosto,
  mode = "full",
  quickPresetCategoria,
  onClose,
  onSaved,
}: CostoFormModalProps) {
  const [giorni, setGiorni] = useState<Giorno[]>([]);
  const [form, setForm] = useState<CostoFormState>(buildInitialState(initialCosto));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const tripParticipantsUi = useMemo(
    () => normalizeTripParticipantsForUi(partecipantiViaggio),
    [partecipantiViaggio],
  );
  const payerLabels = useMemo(() => getPayerLabels(tripParticipantsUi), [tripParticipantsUi]);
  const isSplitSupported = tripParticipantsUi.length === 2;
  const currentPayerIsListed = useMemo(() => {
    if (!form.pagatoDa || form.pagatoDa === "DIVISO") {
      return true;
    }
    return tripParticipantsUi.some((name) => name === form.pagatoDa);
  }, [form.pagatoDa, tripParticipantsUi]);

  const effectiveMode: "full" | "quick" = initialCosto ? "full" : mode;
  const quickCategoria: "BENZINA" | "PEDAGGI" = quickPresetCategoria ?? "BENZINA";
  const isQuickBenzina = effectiveMode === "quick" && quickCategoria === "BENZINA";
  const isQuickPedaggi = effectiveMode === "quick" && quickCategoria === "PEDAGGI";

  const modalTitle = useMemo(() => {
    if (initialCosto) {
      return "Modifica costo";
    }
    if (isQuickBenzina) {
      return "Quick Add Benzina";
    }
    if (isQuickPedaggi) {
      return "Quick Add Pedaggio";
    }
    return "Nuovo costo";
  }, [initialCosto, isQuickBenzina, isQuickPedaggi]);

  useEffect(() => {
    if (!isOpen) return;

    const baseState = buildInitialState(initialCosto);
    if (!initialCosto) {
      baseState.pagatoDa = tripParticipantsUi[0] ?? "IO";
    }
    if (!initialCosto && effectiveMode === "quick") {
      baseState.categoria = quickCategoria;
      baseState.titolo = quickCategoria === "BENZINA" ? "Benzina" : "Pedaggio";
      baseState.data = baseState.data || todayDateInput();
    }

    setForm(baseState);
    setError(null);
  }, [isOpen, initialCosto, effectiveMode, quickCategoria, tripParticipantsUi]);

  useEffect(() => {
    if (!isOpen || effectiveMode !== "full") return;

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
  }, [isOpen, viaggioId, effectiveMode]);

  const derivedPrezzoLitro = useMemo(() => {
    if (!isQuickBenzina) {
      return undefined;
    }

    const importo = toOptionalNumber(form.importo);
    const litri = toOptionalNumber(form.litri);
    if (importo === undefined || importo <= 0 || litri === undefined || litri <= 0) {
      return undefined;
    }

    return roundTwo(importo / litri);
  }, [form.importo, form.litri, isQuickBenzina]);

  if (!isOpen) return null;

  async function handleSave(): Promise<void> {
    const dataIso = toIsoDate(form.data);
    if (!dataIso) {
      setError("Data obbligatoria e valida.");
      return;
    }

    const categoriaFinale: CostoCategoria =
      effectiveMode === "quick" ? quickCategoria : form.categoria;
    const titoloFinale =
      effectiveMode === "quick"
        ? quickCategoria === "BENZINA"
          ? "Benzina"
          : "Pedaggio"
        : form.titolo.trim();

    if (effectiveMode === "full" && !titoloFinale) {
      setError("Titolo obbligatorio.");
      return;
    }

    const importoInput = toOptionalNumber(form.importo);
    const litriInput = toOptionalNumber(form.litri);
    const prezzoLitroInput = toOptionalNumber(form.prezzoLitro);

    let importoFinale = importoInput;
    let litriFinali: number | undefined;
    let prezzoLitroFinale: number | undefined;

    if (isQuickBenzina) {
      if (litriInput === undefined || litriInput <= 0) {
        setError("Litri obbligatori e maggiori di zero.");
        return;
      }

      if (importoFinale === undefined || importoFinale <= 0) {
        setError("Importo obbligatorio e maggiore di zero.");
        return;
      }

      litriFinali = litriInput;
      prezzoLitroFinale = roundThree(importoFinale / litriInput);
    } else if (isQuickPedaggi) {
      if (importoFinale === undefined || importoFinale <= 0) {
        setError("Importo obbligatorio e maggiore di zero.");
        return;
      }
    } else {
      if (importoFinale === undefined || importoFinale <= 0) {
        setError("Importo deve essere maggiore di zero.");
        return;
      }

      if (categoriaFinale === "BENZINA") {
        if (litriInput !== undefined && litriInput <= 0) {
          setError("Litri deve essere maggiore di zero.");
          return;
        }
        if (prezzoLitroInput !== undefined && prezzoLitroInput <= 0) {
          setError("Prezzo/L deve essere maggiore di zero.");
          return;
        }
        litriFinali = litriInput;
        prezzoLitroFinale = prezzoLitroInput;
      }
    }

    const quotaIo = toOptionalNumber(form.quotaIo);
    const quotaLei = toOptionalNumber(form.quotaLei);

    if (form.pagatoDa === "DIVISO") {
      if (!isSplitSupported) {
        setError("Split avanzato non ancora supportato: usa un pagatore singolo.");
        return;
      }

      if (quotaIo === undefined || quotaLei === undefined) {
        setError(`Per DIVISO inserisci quota ${payerLabels.labelIO} e quota ${payerLabels.labelLEI}.`);
        return;
      }

      const diff = Math.abs(quotaIo + quotaLei - importoFinale);
      if (diff > 0.01) {
        setError(
          `Quota ${payerLabels.labelIO} + quota ${payerLabels.labelLEI} deve essere uguale all'importo.`,
        );
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
        giornoId: effectiveMode === "full" ? toOptionalString(form.giornoId) : undefined,
        categoria: categoriaFinale,
        titolo: titoloFinale,
        data: dataIso,
        ora: effectiveMode === "full" ? toOptionalString(form.ora) : undefined,
        valuta: "EUR",
        importo: importoFinale,
        litri: categoriaFinale === "BENZINA" ? litriFinali : undefined,
        prezzoLitro: categoriaFinale === "BENZINA" ? prezzoLitroFinale : undefined,
        pagatoDa: form.pagatoDa as CostoPagatoDa,
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
          <h2 style={{ margin: 0 }}>{modalTitle}</h2>
          <button type="button" className="buttonGhost" onClick={onClose}>
            {"\u2715"}
          </button>
        </div>

        {error && <p className="errorText">{error}</p>}

        {effectiveMode === "full" ? (
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
              <option value="PEDAGGI">PEDAGGI</option>
              <option value="PRANZO">PRANZO</option>
              <option value="CENA">CENA</option>
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
                  pagatoDa: event.target.value,
                }))
              }
            >
              {tripParticipantsUi.map((name) => (
                <option key={`full-payer-${name}`} value={name}>
                  {name}
                </option>
              ))}
              {!currentPayerIsListed && form.pagatoDa && form.pagatoDa !== "DIVISO" && (
                <option value={form.pagatoDa}>{form.pagatoDa} (storico)</option>
              )}
              <option value="DIVISO" disabled={!isSplitSupported}>
                DIVISO{!isSplitSupported ? " (solo 2 partecipanti)" : ""}
              </option>
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

            {form.categoria === "BENZINA" && (
              <>
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Litri (opz.)"
                  value={form.litri}
                  onChange={(event) => setForm((current) => ({ ...current, litri: event.target.value }))}
                />
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="Prezzo/L (opz.)"
                  value={form.prezzoLitro}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, prezzoLitro: event.target.value }))
                  }
                />
              </>
            )}

            {form.pagatoDa === "DIVISO" && (
              <>
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Quota ${payerLabels.labelIO}`}
                  value={form.quotaIo}
                  onChange={(event) => setForm((current) => ({ ...current, quotaIo: event.target.value }))}
                />
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Quota ${payerLabels.labelLEI}`}
                  value={form.quotaLei}
                  onChange={(event) => setForm((current) => ({ ...current, quotaLei: event.target.value }))}
                />
              </>
            )}

            {!isSplitSupported && (
              <p className="metaText costiCol2" style={{ margin: "0.1rem 0", color: "#fbbf24" }}>
                Split avanzato non ancora supportato: usa un pagatore singolo.
              </p>
            )}

            <textarea
              className="inputField costiCol2"
              rows={4}
              placeholder="Note"
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
        ) : (
          <div className="costiGrid">
            <p className="metaText costiCol2" style={{ margin: "0.2rem 0" }}>
              Categoria bloccata: <strong>{quickCategoria}</strong>
            </p>

            <input
              className="inputField"
              type="number"
              min={0}
              step="0.01"
              placeholder="Importo (EUR)"
              value={form.importo}
              onChange={(event) => setForm((current) => ({ ...current, importo: event.target.value }))}
            />

            {isQuickBenzina && (
              <input
                className="inputField"
                type="number"
                min={0}
                step="0.01"
                placeholder="Litri"
                value={form.litri}
                onChange={(event) => setForm((current) => ({ ...current, litri: event.target.value }))}
              />
            )}

            {isQuickBenzina && derivedPrezzoLitro !== undefined && (
              <p className="metaText costiCol2" style={{ margin: "0.1rem 0" }}>
                Prezzo/L calcolato: {derivedPrezzoLitro.toFixed(3)} EUR/L
              </p>
            )}

            <select
              className="inputField"
              value={form.pagatoDa}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pagatoDa: event.target.value,
                }))
              }
            >
              {tripParticipantsUi.map((name) => (
                <option key={`quick-payer-${name}`} value={name}>
                  {name}
                </option>
              ))}
              {!currentPayerIsListed && form.pagatoDa && form.pagatoDa !== "DIVISO" && (
                <option value={form.pagatoDa}>{form.pagatoDa} (storico)</option>
              )}
              <option value="DIVISO" disabled={!isSplitSupported}>
                DIVISO{!isSplitSupported ? " (solo 2 partecipanti)" : ""}
              </option>
            </select>

            <input
              className="inputField"
              type="date"
              value={form.data}
              onChange={(event) => setForm((current) => ({ ...current, data: event.target.value }))}
            />

            {form.pagatoDa === "DIVISO" && (
              <>
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Quota ${payerLabels.labelIO}`}
                  value={form.quotaIo}
                  onChange={(event) => setForm((current) => ({ ...current, quotaIo: event.target.value }))}
                />
                <input
                  className="inputField"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Quota ${payerLabels.labelLEI}`}
                  value={form.quotaLei}
                  onChange={(event) => setForm((current) => ({ ...current, quotaLei: event.target.value }))}
                />
              </>
            )}

            {!isSplitSupported && (
              <p className="metaText costiCol2" style={{ margin: "0.1rem 0", color: "#fbbf24" }}>
                Split avanzato non ancora supportato: usa un pagatore singolo.
              </p>
            )}

            <textarea
              className="inputField costiCol2"
              rows={3}
              placeholder={isQuickPedaggi ? "Tratta / casello / nota" : "Distributore / localita / nota"}
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
        )}

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
