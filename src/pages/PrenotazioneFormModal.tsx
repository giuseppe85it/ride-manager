import { useEffect, useMemo, useState } from "react";
import type { Giorno } from "../models/Giorno";
import type { ImpostazioniApp } from "../models/ImpostazioniApp";
import type { Prenotazione, PrenotazioneStato, PrenotazioneTipo } from "../models/Prenotazione";
import { getGiorniByViaggio, getImpostazioniApp, savePrenotazione } from "../services/storage";
import "../styles/theme.css";

interface PrenotazioneFormModalProps {
  isOpen: boolean;
  viaggioId: string;
  initialPrenotazione?: Prenotazione | null;
  onClose: () => void;
  onSaved: () => void;
}

interface PrenotazioneFormState {
  giornoId: string;
  tipo: PrenotazioneTipo;
  stato: PrenotazioneStato;
  titolo: string;
  fornitore: string;
  localita: string;
  dataInizio: string;
  dataFine: string;
  oraInizio: string;
  oraFine: string;
  indirizzo: string;
  checkIn: string;
  checkOut: string;
  ospiti: string;
  camere: string;
  parcheggioMoto: boolean;
  colazioneInclusa: boolean;
  portoPartenza: string;
  portoArrivo: string;
  compagnia: string;
  nave: string;
  cabina: string;
  veicolo: "MOTO" | "AUTO" | "ALTRO";
  targaVeicolo: string;
  passeggeri: string;
  numeroPrenotazione: string;
  url: string;
  email: string;
  telefono: string;
  costoTotale: string;
  caparra: string;
  pagato: boolean;
  pagatoDa: "" | "IO" | "LEI" | "DIVISO";
  quotaIo: string;
  quotaLei: string;
  note: string;
}

function isoToDateInput(value?: string): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function stringOrEmpty(value?: string): string {
  return value ?? "";
}

function numberToString(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toPagatoDaOption(value?: Prenotazione["pagatoDa"]): "" | "IO" | "LEI" | "DIVISO" {
  if (value === "IO" || value === "LEI" || value === "DIVISO") {
    return value;
  }
  return "";
}

function buildInitialState(prenotazione?: Prenotazione | null): PrenotazioneFormState {
  return {
    giornoId: stringOrEmpty(prenotazione?.giornoId),
    tipo: prenotazione?.tipo ?? "HOTEL",
    stato: prenotazione?.stato ?? "OPZIONE",
    titolo: stringOrEmpty(prenotazione?.titolo),
    fornitore: stringOrEmpty(prenotazione?.fornitore),
    localita: stringOrEmpty(prenotazione?.localita),
    dataInizio: isoToDateInput(prenotazione?.dataInizio),
    dataFine: isoToDateInput(prenotazione?.dataFine),
    oraInizio: stringOrEmpty(prenotazione?.oraInizio),
    oraFine: stringOrEmpty(prenotazione?.oraFine),
    indirizzo: stringOrEmpty(prenotazione?.indirizzo),
    checkIn: stringOrEmpty(prenotazione?.checkIn),
    checkOut: stringOrEmpty(prenotazione?.checkOut),
    ospiti: numberToString(prenotazione?.ospiti),
    camere: numberToString(prenotazione?.camere),
    parcheggioMoto: prenotazione?.parcheggioMoto ?? false,
    colazioneInclusa: prenotazione?.colazioneInclusa ?? false,
    portoPartenza: stringOrEmpty(prenotazione?.portoPartenza),
    portoArrivo: stringOrEmpty(prenotazione?.portoArrivo),
    compagnia: stringOrEmpty(prenotazione?.compagnia),
    nave: stringOrEmpty(prenotazione?.nave),
    cabina: stringOrEmpty(prenotazione?.cabina),
    veicolo: prenotazione?.veicolo ?? "MOTO",
    targaVeicolo: stringOrEmpty(prenotazione?.targaVeicolo),
    passeggeri: numberToString(prenotazione?.passeggeri),
    numeroPrenotazione: stringOrEmpty(prenotazione?.numeroPrenotazione),
    url: stringOrEmpty(prenotazione?.url),
    email: stringOrEmpty(prenotazione?.email),
    telefono: stringOrEmpty(prenotazione?.telefono),
    costoTotale: numberToString(prenotazione?.costoTotale),
    caparra: numberToString(prenotazione?.caparra),
    pagato: prenotazione?.pagato ?? false,
    pagatoDa: toPagatoDaOption(prenotazione?.pagatoDa),
    quotaIo: numberToString(prenotazione?.quotaIo),
    quotaLei: numberToString(prenotazione?.quotaLei),
    note: stringOrEmpty(prenotazione?.note),
  };
}

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIso(date: string, time?: string): string | null {
  if (!date) {
    return null;
  }

  const base = time ? `${date}T${time}` : `${date}T00:00`;
  const parsed = Date.parse(base);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function formatDayOption(giorno: Giorno): string {
  return `${giorno.data} - ${giorno.titolo.trim() ? giorno.titolo : "Senza titolo"}`;
}

function getPayerLabels(settings?: ImpostazioniApp): { labelIO: string; labelLEI: string } {
  const first = settings?.partecipanti[0]?.nome?.trim();
  const second = settings?.partecipanti[1]?.nome?.trim();
  return {
    labelIO: first ? first : "IO",
    labelLEI: second ? second : "LEI",
  };
}

export default function PrenotazioneFormModal({
  isOpen,
  viaggioId,
  initialPrenotazione,
  onClose,
  onSaved,
}: PrenotazioneFormModalProps) {
  const [giorni, setGiorni] = useState<Giorno[]>([]);
  const [form, setForm] = useState<PrenotazioneFormState>(buildInitialState(initialPrenotazione));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [payerLabels, setPayerLabels] = useState<{ labelIO: string; labelLEI: string }>({
    labelIO: "IO",
    labelLEI: "LEI",
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;

    async function loadGiorni(): Promise<void> {
      try {
        const records = await getGiorniByViaggio(viaggioId);
        if (isActive) {
          const ordered = [...records].sort((left, right) => left.data.localeCompare(right.data));
          setGiorni(ordered);
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
  }, [isOpen, viaggioId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(buildInitialState(initialPrenotazione));
    setError(null);
  }, [isOpen, initialPrenotazione]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isActive = true;

    async function loadSettings(): Promise<void> {
      try {
        const settings = await getImpostazioniApp();
        if (isActive) {
          setPayerLabels(getPayerLabels(settings));
        }
      } catch {
        if (isActive) {
          setPayerLabels({ labelIO: "IO", labelLEI: "LEI" });
        }
      }
    }

    void loadSettings();
    return () => {
      isActive = false;
    };
  }, [isOpen]);

  const modalTitle = useMemo(() => {
    return initialPrenotazione ? "Modifica prenotazione" : "Nuova prenotazione";
  }, [initialPrenotazione]);

  const costoTotaleNumber = useMemo(() => toOptionalNumber(form.costoTotale), [form.costoTotale]);
  const showPaymentSection = typeof costoTotaleNumber === "number" && costoTotaleNumber > 0;

  if (!isOpen) {
    return null;
  }

  async function handleSave(): Promise<void> {
    const titolo = form.titolo.trim();
    if (!titolo) {
      setError("Titolo obbligatorio.");
      return;
    }

    const dataInizioIso = toIso(form.dataInizio, form.oraInizio || undefined);
    if (!dataInizioIso) {
      setError("Data inizio non valida.");
      return;
    }

    const dataFineIso = form.dataFine ? toIso(form.dataFine, form.oraFine || undefined) : null;
    if (form.dataFine && !dataFineIso) {
      setError("Data fine non valida.");
      return;
    }

    if (dataFineIso && Date.parse(dataFineIso) < Date.parse(dataInizioIso)) {
      setError("La data fine non puo' essere precedente alla data inizio.");
      return;
    }

    const costoTotale = toOptionalNumber(form.costoTotale);
    const caparra = toOptionalNumber(form.caparra);
    const hasCostoTotale = typeof costoTotale === "number" && costoTotale > 0;
    const pagatoDa =
      hasCostoTotale && form.pagatoDa ? (form.pagatoDa as "IO" | "LEI" | "DIVISO") : undefined;
    let quotaIo: number | undefined;
    let quotaLei: number | undefined;

    if (pagatoDa === "DIVISO") {
      quotaIo = toOptionalNumber(form.quotaIo);
      quotaLei = toOptionalNumber(form.quotaLei);

      if (typeof quotaIo !== "number" || typeof quotaLei !== "number") {
        setError(`Per pagamento DIVISO devi indicare Quota ${payerLabels.labelIO} e Quota ${payerLabels.labelLEI}.`);
        return;
      }

      const delta = Math.abs(quotaIo + quotaLei - costoTotale);
      if (delta > 0.01) {
        setError(
          `Quota ${payerLabels.labelIO} + quota ${payerLabels.labelLEI} deve essere uguale al costo totale.`,
        );
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const payload: Prenotazione = {
        id:
          initialPrenotazione?.id ??
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `pren_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`),
        viaggioId,
        giornoId: toOptionalString(form.giornoId),
        tipo: form.tipo,
        stato: form.stato,
        titolo,
        fornitore: toOptionalString(form.fornitore),
        localita: toOptionalString(form.localita),
        dataInizio: dataInizioIso,
        dataFine: dataFineIso ?? undefined,
        oraInizio: toOptionalString(form.oraInizio),
        oraFine: toOptionalString(form.oraFine),
        indirizzo: toOptionalString(form.indirizzo),
        checkIn: toOptionalString(form.checkIn),
        checkOut: toOptionalString(form.checkOut),
        ospiti: toOptionalInt(form.ospiti),
        camere: toOptionalInt(form.camere),
        parcheggioMoto: form.parcheggioMoto,
        colazioneInclusa: form.colazioneInclusa,
        portoPartenza: toOptionalString(form.portoPartenza),
        portoArrivo: toOptionalString(form.portoArrivo),
        compagnia: toOptionalString(form.compagnia),
        nave: toOptionalString(form.nave),
        cabina: toOptionalString(form.cabina),
        veicolo: form.veicolo,
        targaVeicolo: toOptionalString(form.targaVeicolo),
        passeggeri: toOptionalInt(form.passeggeri),
        numeroPrenotazione: toOptionalString(form.numeroPrenotazione),
        url: toOptionalString(form.url),
        email: toOptionalString(form.email),
        telefono: toOptionalString(form.telefono),
        valuta: "EUR",
        costoTotale,
        caparra,
        pagato: hasCostoTotale ? form.pagato : undefined,
        pagatoDa,
        quotaIo: pagatoDa === "DIVISO" ? quotaIo : undefined,
        quotaLei: pagatoDa === "DIVISO" ? quotaLei : undefined,
        note: toOptionalString(form.note),
        createdAt: initialPrenotazione?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      await savePrenotazione(payload);
      onSaved();
      onClose();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Errore salvataggio prenotazione";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="prenModalOverlay" onClick={onClose}>
      <div className="prenModal card" onClick={(event) => event.stopPropagation()}>
        <div className="prenModalHeader">
          <h2 style={{ margin: 0 }}>{modalTitle}</h2>
          <button type="button" className="buttonGhost" onClick={onClose}>
            {"\u2715"}
          </button>
        </div>

        {error && <p className="errorText">{error}</p>}

        <div className="prenGrid">
          <select
            className="inputField"
            value={form.tipo}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tipo: event.target.value as PrenotazioneTipo,
              }))
            }
          >
            <option value="HOTEL">HOTEL</option>
            <option value="TRAGHETTO">TRAGHETTO</option>
          </select>

          <select
            className="inputField"
            value={form.stato}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                stato: event.target.value as PrenotazioneStato,
              }))
            }
          >
            <option value="OPZIONE">OPZIONE</option>
            <option value="CONFERMATA">CONFERMATA</option>
            <option value="CANCELLATA">CANCELLATA</option>
          </select>

          <input
            className="inputField prenColSpan2"
            type="text"
            value={form.titolo}
            placeholder="Titolo"
            onChange={(event) => setForm((current) => ({ ...current, titolo: event.target.value }))}
          />

          <input
            className="inputField"
            type="text"
            value={form.fornitore}
            placeholder="Fornitore"
            onChange={(event) => setForm((current) => ({ ...current, fornitore: event.target.value }))}
          />
          <input
            className="inputField"
            type="text"
            value={form.localita}
            placeholder="Localita"
            onChange={(event) => setForm((current) => ({ ...current, localita: event.target.value }))}
          />

          <input
            className="inputField"
            type="date"
            value={form.dataInizio}
            onChange={(event) => setForm((current) => ({ ...current, dataInizio: event.target.value }))}
          />
          <input
            className="inputField"
            type="time"
            value={form.oraInizio}
            onChange={(event) => setForm((current) => ({ ...current, oraInizio: event.target.value }))}
          />

          <input
            className="inputField"
            type="date"
            value={form.dataFine}
            onChange={(event) => setForm((current) => ({ ...current, dataFine: event.target.value }))}
          />
          <input
            className="inputField"
            type="time"
            value={form.oraFine}
            onChange={(event) => setForm((current) => ({ ...current, oraFine: event.target.value }))}
          />

          <select
            className="inputField prenColSpan2"
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

          {form.tipo === "HOTEL" && (
            <>
              <p className="prenSectionTitle prenColSpan2">Dettagli hotel</p>
              <input
                className="inputField prenColSpan2"
                type="text"
                value={form.indirizzo}
                placeholder="Indirizzo"
                onChange={(event) => setForm((current) => ({ ...current, indirizzo: event.target.value }))}
              />
              <input
                className="inputField"
                type="time"
                value={form.checkIn}
                placeholder="Check-in"
                onChange={(event) => setForm((current) => ({ ...current, checkIn: event.target.value }))}
              />
              <input
                className="inputField"
                type="time"
                value={form.checkOut}
                placeholder="Check-out"
                onChange={(event) => setForm((current) => ({ ...current, checkOut: event.target.value }))}
              />
              <input
                className="inputField"
                type="number"
                min={0}
                value={form.ospiti}
                placeholder="Ospiti"
                onChange={(event) => setForm((current) => ({ ...current, ospiti: event.target.value }))}
              />
              <input
                className="inputField"
                type="number"
                min={0}
                value={form.camere}
                placeholder="Camere"
                onChange={(event) => setForm((current) => ({ ...current, camere: event.target.value }))}
              />
              <label className="prenCheckbox">
                <input
                  type="checkbox"
                  checked={form.parcheggioMoto}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, parcheggioMoto: event.target.checked }))
                  }
                />
                Parcheggio moto
              </label>
              <label className="prenCheckbox">
                <input
                  type="checkbox"
                  checked={form.colazioneInclusa}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, colazioneInclusa: event.target.checked }))
                  }
                />
                Colazione inclusa
              </label>
            </>
          )}

          {form.tipo === "TRAGHETTO" && (
            <>
              <p className="prenSectionTitle prenColSpan2">Dettagli traghetto</p>
              <input
                className="inputField"
                type="text"
                value={form.portoPartenza}
                placeholder="Porto partenza"
                onChange={(event) =>
                  setForm((current) => ({ ...current, portoPartenza: event.target.value }))
                }
              />
              <input
                className="inputField"
                type="text"
                value={form.portoArrivo}
                placeholder="Porto arrivo"
                onChange={(event) =>
                  setForm((current) => ({ ...current, portoArrivo: event.target.value }))
                }
              />
              <input
                className="inputField"
                type="text"
                value={form.compagnia}
                placeholder="Compagnia"
                onChange={(event) => setForm((current) => ({ ...current, compagnia: event.target.value }))}
              />
              <input
                className="inputField"
                type="text"
                value={form.nave}
                placeholder="Nave"
                onChange={(event) => setForm((current) => ({ ...current, nave: event.target.value }))}
              />
              <input
                className="inputField"
                type="text"
                value={form.cabina}
                placeholder="Cabina"
                onChange={(event) => setForm((current) => ({ ...current, cabina: event.target.value }))}
              />
              <select
                className="inputField"
                value={form.veicolo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    veicolo: event.target.value as "MOTO" | "AUTO" | "ALTRO",
                  }))
                }
              >
                <option value="MOTO">MOTO</option>
                <option value="AUTO">AUTO</option>
                <option value="ALTRO">ALTRO</option>
              </select>
              <input
                className="inputField"
                type="text"
                value={form.targaVeicolo}
                placeholder="Targa veicolo"
                onChange={(event) =>
                  setForm((current) => ({ ...current, targaVeicolo: event.target.value }))
                }
              />
              <input
                className="inputField"
                type="number"
                min={0}
                value={form.passeggeri}
                placeholder="Passeggeri"
                onChange={(event) => setForm((current) => ({ ...current, passeggeri: event.target.value }))}
              />
            </>
          )}

          <p className="prenSectionTitle prenColSpan2">Contatti e costi</p>
          <input
            className="inputField"
            type="text"
            value={form.numeroPrenotazione}
            placeholder="Numero prenotazione"
            onChange={(event) =>
              setForm((current) => ({ ...current, numeroPrenotazione: event.target.value }))
            }
          />
          <input
            className="inputField"
            type="url"
            value={form.url}
            placeholder="URL"
            onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
          />
          <input
            className="inputField"
            type="email"
            value={form.email}
            placeholder="Email"
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
          <input
            className="inputField"
            type="tel"
            value={form.telefono}
            placeholder="Telefono"
            onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
          />
          <input
            className="inputField"
            type="number"
            step="0.01"
            min={0}
            value={form.costoTotale}
            placeholder="Costo totale (EUR)"
            onChange={(event) => setForm((current) => ({ ...current, costoTotale: event.target.value }))}
          />
          <input
            className="inputField"
            type="number"
            step="0.01"
            min={0}
            value={form.caparra}
            placeholder="Caparra (EUR)"
            onChange={(event) => setForm((current) => ({ ...current, caparra: event.target.value }))}
          />

          {showPaymentSection && (
            <>
              <p className="prenSectionTitle prenColSpan2">Pagamento</p>
              <select
                className="inputField"
                value={form.pagatoDa}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    pagatoDa: event.target.value as "" | "IO" | "LEI" | "DIVISO",
                  }))
                }
              >
                <option value="">Pagato da (non impostato)</option>
                <option value="IO">{payerLabels.labelIO}</option>
                <option value="LEI">{payerLabels.labelLEI}</option>
                <option value="DIVISO">DIVISO</option>
              </select>
              <label className="prenCheckbox">
                <input
                  type="checkbox"
                  checked={form.pagato}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pagato: event.target.checked }))
                  }
                />
                Pagato
              </label>

              {form.pagatoDa === "DIVISO" && (
                <>
                  <input
                    className="inputField"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.quotaIo}
                    placeholder={`Quota ${payerLabels.labelIO} (EUR)`}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, quotaIo: event.target.value }))
                    }
                  />
                  <input
                    className="inputField"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.quotaLei}
                    placeholder={`Quota ${payerLabels.labelLEI} (EUR)`}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, quotaLei: event.target.value }))
                    }
                  />
                </>
              )}
            </>
          )}

          <textarea
            className="inputField prenColSpan2"
            rows={4}
            value={form.note}
            placeholder="Note"
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
        </div>

        <div className="prenModalFooter">
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
