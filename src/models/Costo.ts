export type CostoCategoria = "BENZINA" | "HOTEL" | "TRAGHETTI" | "EXTRA";
export type CostoPagatoDa = "IO" | "LEI" | "DIVISO";

export interface Costo {
  id: string;
  viaggioId: string;
  giornoId?: string;
  categoria: CostoCategoria;
  titolo: string;
  data: string;
  ora?: string;
  valuta: "EUR";
  importo: number;
  pagatoDa: CostoPagatoDa;
  quotaIo?: number;
  quotaLei?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
