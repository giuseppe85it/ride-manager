import { useEffect, useMemo, useState } from "react";
import type { Costo, CostoCategoria } from "../models/Costo";
import type { ImpostazioniApp } from "../models/ImpostazioniApp";
import type { Prenotazione } from "../models/Prenotazione";
import {
  deleteCosto,
  getCostiByViaggio,
  getImpostazioniApp,
  getPrenotazioniByViaggio,
} from "../services/storage";
import CostoFormModal from "./CostoFormModal";
import "./costi.css";
import "../styles/theme.css";

interface CostiViaggioProps {
  viaggioId: string;
}

type CategoriaFiltro = "ALL" | CostoCategoria;
type CostoModalMode = "full" | "quick";
type QuickPresetCategoria = "BENZINA" | "PEDAGGI";
type BookingCostCategory = "HOTEL" | "TRAGHETTI";
type BookingPagatoDa = "IO" | "LEI" | "DIVISO";

interface BookingCost {
  id: string;
  categoria: BookingCostCategory;
  tipo: Prenotazione["tipo"];
  titolo: string;
  data: string;
  ora?: string;
  importo: number;
  valuta: "EUR";
  pagato: boolean;
  pagatoDa?: BookingPagatoDa;
  quotaIo?: number;
  quotaLei?: number;
}

interface CategoryTotals {
  confirmed: number;
  unpaid: number;
  total: number;
}

interface BookingQuoteResult {
  included: boolean;
  quotaIo: number;
  quotaLei: number;
  missingPayer: boolean;
  invalidSplit: boolean;
}

const CATEGORY_ORDER: CostoCategoria[] = ["BENZINA", "PEDAGGI", "HOTEL", "TRAGHETTI", "EXTRA"];

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "\u2014";
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function categoriaLabel(categoria: CostoCategoria): string {
  if (categoria === "BENZINA") return "Benzina";
  if (categoria === "PEDAGGI") return "Pedaggi";
  if (categoria === "HOTEL") return "Hotel";
  if (categoria === "TRAGHETTI") return "Traghetti";
  return "Extra";
}

function getManualQuote(costo: Costo): { quotaIo: number; quotaLei: number } {
  if (costo.pagatoDa === "IO") {
    return { quotaIo: costo.importo, quotaLei: 0 };
  }

  if (costo.pagatoDa === "LEI") {
    return { quotaIo: 0, quotaLei: costo.importo };
  }

  return {
    quotaIo: typeof costo.quotaIo === "number" ? costo.quotaIo : 0,
    quotaLei: typeof costo.quotaLei === "number" ? costo.quotaLei : 0,
  };
}

function parseDateTimeKey(dateValue: string, timeValue?: string): number {
  const base = Date.parse(dateValue);
  if (Number.isNaN(base)) {
    return 0;
  }

  if (!timeValue) {
    return base;
  }

  const dateOnly = dateValue.split("T")[0];
  const combined = Date.parse(`${dateOnly}T${timeValue}:00`);
  if (!Number.isNaN(combined)) {
    return combined;
  }

  const parts = timeValue.split(":");
  if (parts.length < 2) {
    return base;
  }

  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return base;
  }

  return base + (hour * 60 + minute) * 60 * 1000;
}

function formatDateWithOra(dateValue: string, timeValue?: string): string {
  return `${formatDate(dateValue)}${timeValue ? ` - ${timeValue}` : ""}`;
}

function getBookingCategoria(tipo: Prenotazione["tipo"]): BookingCostCategory | null {
  if (tipo === "HOTEL") {
    return "HOTEL";
  }
  if (tipo === "TRAGHETTO") {
    return "TRAGHETTI";
  }
  return null;
}

function getBookingPayer(value: unknown): BookingPagatoDa | undefined {
  if (value === "IO" || value === "LEI" || value === "DIVISO") {
    return value;
  }
  return undefined;
}

function getBookingQuoteResult(booking: BookingCost): BookingQuoteResult {
  if (booking.pagatoDa === "IO") {
    return {
      included: true,
      quotaIo: booking.importo,
      quotaLei: 0,
      missingPayer: false,
      invalidSplit: false,
    };
  }

  if (booking.pagatoDa === "LEI") {
    return {
      included: true,
      quotaIo: 0,
      quotaLei: booking.importo,
      missingPayer: false,
      invalidSplit: false,
    };
  }

  if (booking.pagatoDa === "DIVISO") {
    const quotaIo = typeof booking.quotaIo === "number" ? booking.quotaIo : undefined;
    const quotaLei = typeof booking.quotaLei === "number" ? booking.quotaLei : undefined;

    if (quotaIo === undefined || quotaLei === undefined) {
      return {
        included: false,
        quotaIo: 0,
        quotaLei: 0,
        missingPayer: false,
        invalidSplit: true,
      };
    }

    const delta = Math.abs(quotaIo + quotaLei - booking.importo);
    if (delta > 0.01) {
      return {
        included: false,
        quotaIo: 0,
        quotaLei: 0,
        missingPayer: false,
        invalidSplit: true,
      };
    }

    return {
      included: true,
      quotaIo,
      quotaLei,
      missingPayer: false,
      invalidSplit: false,
    };
  }

  return {
    included: false,
    quotaIo: 0,
    quotaLei: 0,
    missingPayer: true,
    invalidSplit: false,
  };
}

function buildEmptyTotals(): Record<CostoCategoria, CategoryTotals> {
  return {
    BENZINA: { confirmed: 0, unpaid: 0, total: 0 },
    PEDAGGI: { confirmed: 0, unpaid: 0, total: 0 },
    HOTEL: { confirmed: 0, unpaid: 0, total: 0 },
    TRAGHETTI: { confirmed: 0, unpaid: 0, total: 0 },
    EXTRA: { confirmed: 0, unpaid: 0, total: 0 },
  };
}

function buildEmptyCostListMap(): Record<CostoCategoria, Costo[]> {
  return {
    BENZINA: [],
    PEDAGGI: [],
    HOTEL: [],
    TRAGHETTI: [],
    EXTRA: [],
  };
}

function buildEmptyBookingListMap(): Record<CostoCategoria, BookingCost[]> {
  return {
    BENZINA: [],
    PEDAGGI: [],
    HOTEL: [],
    TRAGHETTI: [],
    EXTRA: [],
  };
}

function getPayerBadgeLabel(value?: BookingPagatoDa): string {
  return value ?? "PAYER?";
}

function getPayerLabels(settings?: ImpostazioniApp): { labelIO: string; labelLEI: string } {
  const first = settings?.partecipanti[0]?.nome?.trim();
  const second = settings?.partecipanti[1]?.nome?.trim();
  return {
    labelIO: first ? first : "IO",
    labelLEI: second ? second : "LEI",
  };
}

function mapPayerDisplay(
  payer: BookingPagatoDa | undefined,
  labels: { labelIO: string; labelLEI: string },
): string {
  if (payer === "IO") return labels.labelIO;
  if (payer === "LEI") return labels.labelLEI;
  if (payer === "DIVISO") return "DIVISO";
  return getPayerBadgeLabel(payer);
}

export default function CostiViaggio({ viaggioId }: CostiViaggioProps) {
  const [costi, setCosti] = useState<Costo[]>([]);
  const [prenotazioni, setPrenotazioni] = useState<Prenotazione[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaFiltro>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<CostoModalMode>("full");
  const [quickPresetCategoria, setQuickPresetCategoria] = useState<QuickPresetCategoria>("BENZINA");
  const [editingCosto, setEditingCosto] = useState<Costo | null>(null);
  const [payerLabels, setPayerLabels] = useState<{ labelIO: string; labelLEI: string }>({
    labelIO: "IO",
    labelLEI: "LEI",
  });

  async function loadCosti(): Promise<void> {
    try {
      setIsLoading(true);
      const [costiRecords, prenotazioniRecords, settings] = await Promise.all([
        getCostiByViaggio(viaggioId),
        getPrenotazioniByViaggio(viaggioId),
        getImpostazioniApp(),
      ]);
      setCosti(costiRecords);
      setPrenotazioni(prenotazioniRecords);
      setPayerLabels(getPayerLabels(settings));
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Errore caricamento costi e prenotazioni";
      setError(message);
      setPayerLabels({ labelIO: "IO", labelLEI: "LEI" });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCosti();
  }, [viaggioId]);

  const bookingCosts = useMemo<BookingCost[]>(() => {
    return prenotazioni.flatMap((prenotazione) => {
      const importo = Number(prenotazione.costoTotale);
      if (!Number.isFinite(importo) || importo <= 0) {
        return [];
      }

      const categoria = getBookingCategoria(prenotazione.tipo);
      if (!categoria) {
        return [];
      }

      return [
        {
          id: prenotazione.id,
          categoria,
          tipo: prenotazione.tipo,
          titolo: prenotazione.titolo,
          data: prenotazione.dataInizio,
          ora: prenotazione.oraInizio,
          importo,
          valuta: prenotazione.valuta,
          pagato: prenotazione.pagato === true,
          pagatoDa: getBookingPayer(prenotazione.pagatoDa),
          quotaIo: typeof prenotazione.quotaIo === "number" ? prenotazione.quotaIo : undefined,
          quotaLei: typeof prenotazione.quotaLei === "number" ? prenotazione.quotaLei : undefined,
        },
      ];
    });
  }, [prenotazioni]);

  const analytics = useMemo(() => {
    const visibleCategories = CATEGORY_ORDER.filter((category) =>
      categoriaFiltro === "ALL" ? true : category === categoriaFiltro,
    );
    const visibleSet = new Set<CostoCategoria>(visibleCategories);

    const manualByCategory = buildEmptyCostListMap();
    for (const costo of costi) {
      if (visibleSet.has(costo.categoria)) {
        manualByCategory[costo.categoria].push(costo);
      }
    }
    for (const category of CATEGORY_ORDER) {
      manualByCategory[category].sort(
        (left, right) => parseDateTimeKey(right.data, right.ora) - parseDateTimeKey(left.data, left.ora),
      );
    }

    const bookingPaidByCategory = buildEmptyBookingListMap();
    const bookingUnpaidByCategory = buildEmptyBookingListMap();
    for (const booking of bookingCosts) {
      if (!visibleSet.has(booking.categoria)) {
        continue;
      }

      if (booking.pagato) {
        bookingPaidByCategory[booking.categoria].push(booking);
      } else {
        bookingUnpaidByCategory[booking.categoria].push(booking);
      }
    }
    for (const category of CATEGORY_ORDER) {
      bookingPaidByCategory[category].sort(
        (left, right) => parseDateTimeKey(right.data, right.ora) - parseDateTimeKey(left.data, left.ora),
      );
      bookingUnpaidByCategory[category].sort(
        (left, right) => parseDateTimeKey(right.data, right.ora) - parseDateTimeKey(left.data, left.ora),
      );
    }

    const totalsByCategory = buildEmptyTotals();
    for (const category of visibleCategories) {
      const manualTotal = manualByCategory[category].reduce((acc, item) => acc + item.importo, 0);
      const bookingPaidTotal = bookingPaidByCategory[category].reduce((acc, item) => acc + item.importo, 0);
      const bookingUnpaidTotal = bookingUnpaidByCategory[category].reduce(
        (acc, item) => acc + item.importo,
        0,
      );

      totalsByCategory[category] = {
        confirmed: manualTotal + bookingPaidTotal,
        unpaid: bookingUnpaidTotal,
        total: manualTotal + bookingPaidTotal + bookingUnpaidTotal,
      };
    }

    let totaleConfermato = 0;
    let totaleDaPagare = 0;
    let totaleComplessivo = 0;
    for (const category of visibleCategories) {
      totaleConfermato += totalsByCategory[category].confirmed;
      totaleDaPagare += totalsByCategory[category].unpaid;
      totaleComplessivo += totalsByCategory[category].total;
    }

    let quotaIoTotale = 0;
    let quotaLeiTotale = 0;
    let bookingPaidMissingPayer = 0;
    let bookingPaidInvalidSplit = 0;

    for (const category of visibleCategories) {
      for (const manualItem of manualByCategory[category]) {
        const quote = getManualQuote(manualItem);
        quotaIoTotale += quote.quotaIo;
        quotaLeiTotale += quote.quotaLei;
      }

      for (const bookingItem of bookingPaidByCategory[category]) {
        const quoteResult = getBookingQuoteResult(bookingItem);
        if (quoteResult.included) {
          quotaIoTotale += quoteResult.quotaIo;
          quotaLeiTotale += quoteResult.quotaLei;
          continue;
        }

        if (quoteResult.missingPayer) {
          bookingPaidMissingPayer += 1;
        }
        if (quoteResult.invalidSplit) {
          bookingPaidInvalidSplit += 1;
        }
      }
    }

    return {
      visibleCategories,
      manualByCategory,
      bookingPaidByCategory,
      bookingUnpaidByCategory,
      totalsByCategory,
      totaleConfermato,
      totaleDaPagare,
      totaleComplessivo,
      quotaIoTotale,
      quotaLeiTotale,
      bookingPaidMissingPayer,
      bookingPaidInvalidSplit,
    };
  }, [bookingCosts, categoriaFiltro, costi]);

  async function handleDelete(costoId: string): Promise<void> {
    const confirmed = window.confirm("Eliminare questo costo?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteCosto(costoId);
      await loadCosti();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore eliminazione costo";
      setError(message);
    }
  }

  return (
    <section className="card detailCard costiPage">
      <div className="costiToolbar">
        <h2 style={{ margin: 0 }}>Costi</h2>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="buttonGhost"
            onClick={() => {
              setEditingCosto(null);
              setModalMode("quick");
              setQuickPresetCategoria("BENZINA");
              setIsModalOpen(true);
            }}
          >
            + Benzina
          </button>
          <button
            type="button"
            className="buttonGhost"
            onClick={() => {
              setEditingCosto(null);
              setModalMode("quick");
              setQuickPresetCategoria("PEDAGGI");
              setIsModalOpen(true);
            }}
          >
            + Pedaggio
          </button>
          <button
            type="button"
            className="buttonPrimary"
            onClick={() => {
              setEditingCosto(null);
              setModalMode("full");
              setIsModalOpen(true);
            }}
          >
            + Aggiungi costo
          </button>
        </div>
      </div>

      <div className="costiFilters">
        <button
          type="button"
          className={categoriaFiltro === "ALL" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("ALL")}
        >
          Tutti
        </button>
        <button
          type="button"
          className={categoriaFiltro === "BENZINA" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("BENZINA")}
        >
          Benzina
        </button>
        <button
          type="button"
          className={categoriaFiltro === "PEDAGGI" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("PEDAGGI")}
        >
          Pedaggi
        </button>
        <button
          type="button"
          className={categoriaFiltro === "HOTEL" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("HOTEL")}
        >
          Hotel
        </button>
        <button
          type="button"
          className={categoriaFiltro === "TRAGHETTI" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("TRAGHETTI")}
        >
          Traghetti
        </button>
        <button
          type="button"
          className={categoriaFiltro === "EXTRA" ? "buttonPrimary" : "buttonGhost"}
          onClick={() => setCategoriaFiltro("EXTRA")}
        >
          Extra
        </button>
      </div>

      <div className="costiTotals" style={{ marginBottom: "0.8rem" }}>
        <div className="card" style={{ padding: "0.9rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale CONFERMATO (pagato)
          </p>
          <strong>{formatEuro(analytics.totaleConfermato)}</strong>
        </div>
        <div className="card" style={{ padding: "0.9rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale DA PAGARE (prenotazioni)
          </p>
          <strong>{formatEuro(analytics.totaleDaPagare)}</strong>
        </div>
        <div className="card" style={{ padding: "0.9rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale COMPLESSIVO
          </p>
          <strong>{formatEuro(analytics.totaleComplessivo)}</strong>
        </div>
      </div>

      <div className="card" style={{ padding: "0.85rem", marginBottom: "0.8rem", overflowX: "auto" }}>
        <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
          Breakdown per categoria
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "420px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.45rem", borderBottom: "1px solid rgba(148, 163, 184, 0.25)" }}>
                Categoria
              </th>
              <th style={{ textAlign: "right", padding: "0.45rem", borderBottom: "1px solid rgba(148, 163, 184, 0.25)" }}>
                Confermati
              </th>
              <th style={{ textAlign: "right", padding: "0.45rem", borderBottom: "1px solid rgba(148, 163, 184, 0.25)" }}>
                Da pagare
              </th>
              <th style={{ textAlign: "right", padding: "0.45rem", borderBottom: "1px solid rgba(148, 163, 184, 0.25)" }}>
                Totale
              </th>
            </tr>
          </thead>
          <tbody>
            {analytics.visibleCategories.map((category) => (
              <tr key={`row-${category}`}>
                <td style={{ padding: "0.45rem", borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
                  {categoriaLabel(category)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    padding: "0.45rem",
                    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                  }}
                >
                  {formatEuro(analytics.totalsByCategory[category].confirmed)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    padding: "0.45rem",
                    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                  }}
                >
                  {formatEuro(analytics.totalsByCategory[category].unpaid)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    padding: "0.45rem",
                    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                  }}
                >
                  {formatEuro(analytics.totalsByCategory[category].total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: "0.85rem", marginBottom: "1rem" }}>
        <p className="metaText" style={{ margin: "0.2rem 0" }}>
          Quote {payerLabels.labelIO} (confermati): {formatEuro(analytics.quotaIoTotale)}
        </p>
        <p className="metaText" style={{ margin: "0.2rem 0" }}>
          Quote {payerLabels.labelLEI} (confermati): {formatEuro(analytics.quotaLeiTotale)}
        </p>
        {analytics.bookingPaidMissingPayer > 0 && (
          <p className="metaText" style={{ margin: "0.2rem 0", color: "#fb7185" }}>
            Prenotazioni pagate senza payer: {analytics.bookingPaidMissingPayer}
          </p>
        )}
        {analytics.bookingPaidInvalidSplit > 0 && (
          <p className="metaText" style={{ margin: "0.2rem 0", color: "#fb7185" }}>
            Prenotazioni pagate con quote DIVISO non coerenti: {analytics.bookingPaidInvalidSplit}
          </p>
        )}
      </div>

      {isLoading && <p className="metaText">Caricamento costi...</p>}
      {!isLoading && error && <p className="errorText">{error}</p>}

      {!isLoading && !error &&
        analytics.visibleCategories.map((category) => {
          const manualItems = analytics.manualByCategory[category];
          const paidBookingItems = analytics.bookingPaidByCategory[category];
          const unpaidBookingItems = analytics.bookingUnpaidByCategory[category];

          return (
            <section key={`group-${category}`} className="card" style={{ padding: "0.9rem", marginBottom: "1rem" }}>
              <h3 style={{ margin: "0 0 0.55rem 0" }}>{categoriaLabel(category)}</h3>

              <p className="metaText" style={{ margin: "0.3rem 0" }}>
                Manuali (confermati)
              </p>
              {manualItems.length === 0 && <p className="metaText">Nessun costo manuale.</p>}
              {manualItems.length > 0 && (
                <ul className="listPlain cardsGrid">
                  {manualItems.map((costo) => {
                    const quote = getManualQuote(costo);
                    const litriText =
                      typeof costo.litri === "number" && Number.isFinite(costo.litri)
                        ? `${costo.litri.toFixed(1)} L`
                        : null;
                    const prezzoLitroText =
                      typeof costo.prezzoLitro === "number" && Number.isFinite(costo.prezzoLitro)
                        ? `${costo.prezzoLitro.toFixed(3)} EUR/L`
                        : null;
                    const benzinaDetail = [litriText, prezzoLitroText].filter(Boolean).join(" · ");
                    return (
                      <li key={costo.id} className="card costiCard">
                        <div className="costiCardHeader">
                          <span className="badge">{categoriaLabel(costo.categoria)}</span>
                          <strong>{costo.titolo}</strong>
                        </div>
                        <p className="metaText" style={{ margin: "0.25rem 0" }}>
                          Data: {formatDateWithOra(costo.data, costo.ora)}
                        </p>
                        <p className="metaText" style={{ margin: "0.25rem 0" }}>
                          Importo: {formatEuro(costo.importo)}
                        </p>
                        {costo.categoria === "BENZINA" && benzinaDetail && (
                          <p className="metaText" style={{ margin: "0.25rem 0" }}>
                            {benzinaDetail}
                          </p>
                        )}
                        <p className="metaText" style={{ margin: "0.25rem 0" }}>
                          Quota {payerLabels.labelIO}: {formatEuro(quote.quotaIo)} | Quota {payerLabels.labelLEI}:{" "}
                          {formatEuro(quote.quotaLei)}
                        </p>
                        {costo.note && (
                          <p className="metaText" style={{ margin: "0.25rem 0" }}>
                            Note: {costo.note}
                          </p>
                        )}
                        <div className="costiActions">
                          <button
                            type="button"
                            className="buttonGhost"
                            onClick={() => {
                              setEditingCosto(costo);
                              setModalMode("full");
                              setIsModalOpen(true);
                            }}
                          >
                            Modifica
                          </button>
                          <button type="button" className="buttonGhost" onClick={() => void handleDelete(costo.id)}>
                            Elimina
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="metaText" style={{ margin: "0.7rem 0 0.3rem" }}>
                Prenotazioni pagate (confermate)
              </p>
              {paidBookingItems.length === 0 && <p className="metaText">Nessuna prenotazione pagata.</p>}
              {paidBookingItems.length > 0 && (
                <ul className="listPlain cardsGrid">
                  {paidBookingItems.map((booking) => {
                    const quoteResult = getBookingQuoteResult(booking);
                    const payerMissing = quoteResult.missingPayer;
                    const invalidSplit = quoteResult.invalidSplit;
                    const payerLabel = mapPayerDisplay(booking.pagatoDa, payerLabels);

                    return (
                      <li key={`paid-${booking.id}`} className="card costiCard">
                        <div className="costiCardHeader">
                          <span className="badge">{booking.tipo}</span>
                          <strong>{booking.titolo}</strong>
                        </div>
                        <p className="metaText" style={{ margin: "0.25rem 0" }}>
                          Data: {formatDateWithOra(booking.data, booking.ora)}
                        </p>
                        <p className="metaText" style={{ margin: "0.25rem 0" }}>
                          Importo: {formatEuro(booking.importo)}
                        </p>
                        <p className="metaText" style={{ margin: "0.25rem 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span
                            className="badge"
                            style={{
                              borderColor: "rgba(52, 211, 153, 0.6)",
                              background: "rgba(52, 211, 153, 0.2)",
                              color: "#34d399",
                            }}
                          >
                            PAGATO
                          </span>
                          <span
                            className="badge"
                            style={
                              payerMissing
                                ? {
                                    borderColor: "rgba(225, 29, 72, 0.65)",
                                    background: "rgba(225, 29, 72, 0.2)",
                                    color: "#fb7185",
                                  }
                                : undefined
                            }
                          >
                            {payerLabel}
                          </span>
                        </p>
                        {payerMissing && (
                          <p className="metaText" style={{ margin: "0.25rem 0", color: "#fb7185" }}>
                            Payer mancante: costo confermato ma escluso da quote {payerLabels.labelIO}/
                            {payerLabels.labelLEI}.
                          </p>
                        )}
                        {invalidSplit && (
                          <p className="metaText" style={{ margin: "0.25rem 0", color: "#fb7185" }}>
                            Quote DIVISO non coerenti: costo escluso da quote {payerLabels.labelIO}/
                            {payerLabels.labelLEI}.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="metaText" style={{ margin: "0.7rem 0 0.3rem" }}>
                Prenotazioni da pagare
              </p>
              {unpaidBookingItems.length === 0 && <p className="metaText">Nessuna prenotazione da pagare.</p>}
              {unpaidBookingItems.length > 0 && (
                <ul className="listPlain cardsGrid">
                  {unpaidBookingItems.map((booking) => (
                    <li key={`unpaid-${booking.id}`} className="card costiCard">
                      <div className="costiCardHeader">
                        <span className="badge">{booking.tipo}</span>
                        <strong>{booking.titolo}</strong>
                      </div>
                      <p className="metaText" style={{ margin: "0.25rem 0" }}>
                        Data: {formatDateWithOra(booking.data, booking.ora)}
                      </p>
                      <p className="metaText" style={{ margin: "0.25rem 0" }}>
                        Importo: {formatEuro(booking.importo)}
                      </p>
                      <p className="metaText" style={{ margin: "0.25rem 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span
                          className="badge"
                          style={{
                            borderColor: "rgba(225, 29, 72, 0.65)",
                            background: "rgba(225, 29, 72, 0.2)",
                            color: "#fb7185",
                          }}
                        >
                          DA PAGARE
                        </span>
                        <span
                          className="badge"
                          style={
                            booking.pagatoDa
                              ? undefined
                              : {
                                  borderColor: "rgba(225, 29, 72, 0.65)",
                                  background: "rgba(225, 29, 72, 0.2)",
                                  color: "#fb7185",
                                }
                          }
                        >
                          {mapPayerDisplay(booking.pagatoDa, payerLabels)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

      <CostoFormModal
        isOpen={isModalOpen}
        viaggioId={viaggioId}
        initialCosto={editingCosto}
        mode={modalMode}
        quickPresetCategoria={quickPresetCategoria}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => void loadCosti()}
      />
    </section>
  );
}
