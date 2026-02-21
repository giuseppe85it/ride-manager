import { useEffect, useMemo, useState } from "react";
import type { Costo, CostoCategoria } from "../models/Costo";
import { deleteCosto, getCostiByViaggio } from "../services/storage";
import CostoFormModal from "./CostoFormModal";
import "./costi.css";
import "../styles/theme.css";

interface CostiViaggioProps {
  viaggioId: string;
}

type CategoriaFiltro = "ALL" | CostoCategoria;

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

function sortKey(costo: Costo): number {
  const base = Date.parse(costo.data);
  if (Number.isNaN(base)) {
    return 0;
  }

  if (!costo.ora) {
    return base;
  }

  const parts = costo.ora.split(":");
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

export default function CostiViaggio({ viaggioId }: CostiViaggioProps) {
  const [costi, setCosti] = useState<Costo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaFiltro>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCosto, setEditingCosto] = useState<Costo | null>(null);

  async function loadCosti(): Promise<void> {
    try {
      setIsLoading(true);
      const records = await getCostiByViaggio(viaggioId);
      setCosti(records);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Errore caricamento costi";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCosti();
  }, [viaggioId]);

  const costiFiltrati = useMemo(() => {
    return [...costi]
      .filter((costo) => (categoriaFiltro === "ALL" ? true : costo.categoria === categoriaFiltro))
      .sort((left, right) => sortKey(right) - sortKey(left));
  }, [costi, categoriaFiltro]);

  const totals = useMemo(() => {
    const totalsByCategory: Record<CostoCategoria, number> = {
      BENZINA: 0,
      HOTEL: 0,
      TRAGHETTI: 0,
      EXTRA: 0,
    };

    let totaleGenerale = 0;
    let totaleIo = 0;
    let totaleLei = 0;

    for (const costo of costiFiltrati) {
      totaleGenerale += costo.importo;
      totalsByCategory[costo.categoria] += costo.importo;

      const quote = getQuote(costo);
      totaleIo += quote.quotaIo;
      totaleLei += quote.quotaLei;
    }

    return {
      totaleGenerale,
      totalsByCategory,
      totaleIo,
      totaleLei,
    };
  }, [costiFiltrati]);

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
            Totale generale
          </p>
          <strong>{formatEuro(totals.totaleGenerale)}</strong>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Totali per categoria
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Benzina: {formatEuro(totals.totalsByCategory.BENZINA)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Hotel: {formatEuro(totals.totalsByCategory.HOTEL)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Traghetti: {formatEuro(totals.totalsByCategory.TRAGHETTI)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            Extra: {formatEuro(totals.totalsByCategory.EXTRA)}
          </p>
        </div>
        <div className="card" style={{ padding: "0.75rem" }}>
          <p className="metaText" style={{ margin: "0 0 0.35rem 0" }}>
            Quota
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            IO: {formatEuro(totals.totaleIo)}
          </p>
          <p className="metaText" style={{ margin: "0.2rem 0" }}>
            LEI: {formatEuro(totals.totaleLei)}
          </p>
        </div>
      </div>

      {isLoading && <p className="metaText">Caricamento costi...</p>}
      {!isLoading && error && <p className="errorText">{error}</p>}
      {!isLoading && !error && costiFiltrati.length === 0 && <p className="metaText">Nessun costo trovato.</p>}

      {!isLoading && !error && costiFiltrati.length > 0 && (
        <ul className="listPlain cardsGrid">
          {costiFiltrati.map((costo) => {
            const quote = getQuote(costo);
            return (
              <li key={costo.id} className="card costiCard">
                <div className="costiCardHeader">
                  <span className="badge">{categoriaLabel(costo.categoria)}</span>
                  <strong>{costo.titolo}</strong>
                </div>
                <p className="metaText" style={{ margin: "0.25rem 0" }}>
                  Data: {formatDate(costo.data)} {costo.ora ? `- ${costo.ora}` : ""}
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
