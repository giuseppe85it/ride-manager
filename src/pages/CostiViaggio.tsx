import { useEffect, useMemo, useState } from "react";
import type { Costo, CostoCategoria } from "../models/Costo";
import type { Prenotazione } from "../models/Prenotazione";
import { deleteCosto, getCostiByViaggio, getPrenotazioniByViaggio } from "../services/storage";
import CostoFormModal from "./CostoFormModal";
import "./costi.css";
import "../styles/theme.css";

interface CostiViaggioProps {
  viaggioId: string;
}

type CategoriaFiltro = "ALL" | CostoCategoria;
type BookingCostCategory = "HOTEL" | "TRAGHETTI";

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
}

interface CategoryTotals {
  confirmed: number;
  unpaid: number;
  total: number;
}

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
  if (categoria === "HOTEL") return "Hotel";
  if (categoria === "TRAGHETTI") return "Traghetti";
  return "Extra";
}

function getQuote(costo: Costo): { quotaIo: number; quotaLei: number } {
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

function sortManualCostsDesc(left: Costo, right: Costo): number {
  return parseDateTimeKey(right.data, right.ora) - parseDateTimeKey(left.data, left.ora);
}

function sortBookingCostsDesc(left: BookingCost, right: BookingCost): number {
  return parseDateTimeKey(right.data, right.ora) - parseDateTimeKey(left.data, left.ora);
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

export default function CostiViaggio({ viaggioId }: CostiViaggioProps) {
  const [costi, setCosti] = useState<Costo[]>([]);
  const [prenotazioni, setPrenotazioni] = useState<Prenotazione[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaFiltro>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCosto, setEditingCosto] = useState<Costo | null>(null);

  async function loadCosti(): Promise<void> {
    try {
      setIsLoading(true);
      const [costiRecords, prenotazioniRecords] = await Promise.all([
        getCostiByViaggio(viaggioId),
        getPrenotazioniByViaggio(viaggioId),
      ]);
      setCosti(costiRecords);
      setPrenotazioni(prenotazioniRecords);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Errore caricamento costi e prenotazioni";
      setError(message);
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
        },
      ];
    });
  }, [prenotazioni]);

  const costiManualiFiltrati = useMemo(() => {
    return [...costi]
      .filter((costo) => (categoriaFiltro === "ALL" ? true : costo.categoria === categoriaFiltro))
      .sort(sortManualCostsDesc);
  }, [costi, categoriaFiltro]);

  const bookingPaidFiltrati = useMemo(() => {
    return bookingCosts
      .filter((booking) => booking.pagato)
      .filter((booking) => (categoriaFiltro === "ALL" ? true : booking.categoria === categoriaFiltro))
      .sort(sortBookingCostsDesc);
  }, [bookingCosts, categoriaFiltro]);

  const bookingUnpaidFiltrati = useMemo(() => {
    return bookingCosts
      .filter((booking) => !booking.pagato)
      .filter((booking) => (categoriaFiltro === "ALL" ? true : booking.categoria === categoriaFiltro))
      .sort(sortBookingCostsDesc);
  }, [bookingCosts, categoriaFiltro]);

  const totals = useMemo(() => {
    const totalsByCategory: Record<CostoCategoria, CategoryTotals> = {
      BENZINA: { confirmed: 0, unpaid: 0, total: 0 },
      HOTEL: { confirmed: 0, unpaid: 0, total: 0 },
      TRAGHETTI: { confirmed: 0, unpaid: 0, total: 0 },
      EXTRA: { confirmed: 0, unpaid: 0, total: 0 },
    };

    let totaleManualiConfermati = 0;
    let totaleBookingConfermati = 0;
    let totaleBookingDaPagare = 0;
    let totaleIo = 0;
    let totaleLei = 0;

    for (const costo of costi) {
      totaleManualiConfermati += costo.importo;
      totalsByCategory[costo.categoria].confirmed += costo.importo;
      totalsByCategory[costo.categoria].total += costo.importo;
      const quote = getQuote(costo);
      totaleIo += quote.quotaIo;
      totaleLei += quote.quotaLei;
    }

    for (const booking of bookingCosts) {
      if (booking.pagato) {
        totaleBookingConfermati += booking.importo;
        totalsByCategory[booking.categoria].confirmed += booking.importo;
      } else {
        totaleBookingDaPagare += booking.importo;
        totalsByCategory[booking.categoria].unpaid += booking.importo;
      }
      totalsByCategory[booking.categoria].total += booking.importo;
    }

    const totaleConfermato = totaleManualiConfermati + totaleBookingConfermati;
    const totaleComplessivo = totaleConfermato + totaleBookingDaPagare;

    return {
      totaleConfermato,
      totaleDaPagare: totaleBookingDaPagare,
      totaleComplessivo,
      totaleManualiConfermati,
      totaleBookingConfermati,
      totalsByCategory,
      totaleIo,
      totaleLei,
    };
  }, [bookingCosts, costi]);

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
        <button
          type="button"
          className="buttonPrimary"
          onClick={() => {
            setEditingCosto(null);
            setIsModalOpen(true);
          }}
        >
          + Aggiungi costo
        </button>
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

      <div className="costiTotals">
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale CONFERMATO (pagato)
          </p>
          <strong>{formatEuro(totals.totaleConfermato)}</strong>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale DA PAGARE (prenotazioni)
          </p>
          <strong>{formatEuro(totals.totaleDaPagare)}</strong>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totale COMPLESSIVO
          </p>
          <strong>{formatEuro(totals.totaleComplessivo)}</strong>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totali per categoria
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Benzina: {formatEuro(totals.totalsByCategory.BENZINA.confirmed)} confermati |
            {` ${formatEuro(totals.totalsByCategory.BENZINA.unpaid)} da pagare`} |
            {` ${formatEuro(totals.totalsByCategory.BENZINA.total)} totale`}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Hotel: {formatEuro(totals.totalsByCategory.HOTEL.confirmed)} confermati |
            {` ${formatEuro(totals.totalsByCategory.HOTEL.unpaid)} da pagare`} |
            {` ${formatEuro(totals.totalsByCategory.HOTEL.total)} totale`}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Traghetti: {formatEuro(totals.totalsByCategory.TRAGHETTI.confirmed)} confermati |
            {` ${formatEuro(totals.totalsByCategory.TRAGHETTI.unpaid)} da pagare`} |
            {` ${formatEuro(totals.totalsByCategory.TRAGHETTI.total)} totale`}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Extra: {formatEuro(totals.totalsByCategory.EXTRA.confirmed)} confermati |
            {` ${formatEuro(totals.totalsByCategory.EXTRA.unpaid)} da pagare`} |
            {` ${formatEuro(totals.totalsByCategory.EXTRA.total)} totale`}
          </p>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Quote manuali
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            IO: {formatEuro(totals.totaleIo)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            LEI: {formatEuro(totals.totaleLei)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Manuali confermati: {formatEuro(totals.totaleManualiConfermati)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Prenotazioni pagate: {formatEuro(totals.totaleBookingConfermati)}
          </p>
        </div>
      </div>

      {isLoading && <p className="metaText">Caricamento costi...</p>}
      {!isLoading && error && <p className="errorText">{error}</p>}

      {!isLoading && !error && (
        <>
          <h3 style={{ margin: "0.5rem 0" }}>Costi manuali (confermati)</h3>
          {costiManualiFiltrati.length === 0 && <p className="metaText">Nessun costo manuale trovato.</p>}
          {costiManualiFiltrati.length > 0 && (
            <ul className="listPlain cardsGrid">
              {costiManualiFiltrati.map((costo) => {
                const quote = getQuote(costo);
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
                    <p className="metaText" style={{ margin: "0.25rem 0" }}>
                      Quota IO: {formatEuro(quote.quotaIo)} | Quota LEI: {formatEuro(quote.quotaLei)}
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

          <h3 style={{ margin: "1rem 0 0.5rem" }}>Prenotazioni pagate (confermate)</h3>
          {bookingPaidFiltrati.length === 0 && <p className="metaText">Nessuna prenotazione pagata.</p>}
          {bookingPaidFiltrati.length > 0 && (
            <ul className="listPlain cardsGrid">
              {bookingPaidFiltrati.map((booking) => (
                <li key={`booking-paid-${booking.id}`} className="card costiCard">
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
                  <p className="metaText" style={{ margin: "0.25rem 0" }}>
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
                  </p>
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ margin: "1rem 0 0.5rem" }}>Prenotazioni da pagare</h3>
          {bookingUnpaidFiltrati.length === 0 && <p className="metaText">Nessuna prenotazione da pagare.</p>}
          {bookingUnpaidFiltrati.length > 0 && (
            <ul className="listPlain cardsGrid">
              {bookingUnpaidFiltrati.map((booking) => (
                <li key={`booking-unpaid-${booking.id}`} className="card costiCard">
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
                  <p className="metaText" style={{ margin: "0.25rem 0" }}>
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
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <CostoFormModal
        isOpen={isModalOpen}
        viaggioId={viaggioId}
        initialCosto={editingCosto}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => void loadCosti()}
      />
    </section>
  );
}
