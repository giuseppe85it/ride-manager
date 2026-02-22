export interface Viaggio {
  id: string;
  nome: string;
  dataInizio: string;
  dataFine: string;
  area: string;
  partecipanti?: string[];
  valuta: "EUR";
  stato: "PIANIFICAZIONE" | "ATTIVO" | "CONCLUSO" | "ARCHIVIATO";
  note?: string;
  createdAt: string;
}
