export type PrenotazioneTipo = "HOTEL" | "TRAGHETTO";
export type PrenotazioneStato = "OPZIONE" | "CONFERMATA" | "CANCELLATA";

export interface Prenotazione {
  id: string;
  viaggioId: string;
  giornoId?: string;

  tipo: PrenotazioneTipo;
  stato: PrenotazioneStato;

  titolo: string;
  fornitore?: string;
  localita?: string;

  dataInizio: string;
  dataFine?: string;
  oraInizio?: string;
  oraFine?: string;

  indirizzo?: string;
  checkIn?: string;
  checkOut?: string;
  ospiti?: number;
  camere?: number;
  parcheggioMoto?: boolean;
  colazioneInclusa?: boolean;

  portoPartenza?: string;
  portoArrivo?: string;
  compagnia?: string;
  nave?: string;
  cabina?: string;
  veicolo?: "MOTO" | "AUTO" | "ALTRO";
  targaVeicolo?: string;
  passeggeri?: number;

  numeroPrenotazione?: string;
  url?: string;
  email?: string;
  telefono?: string;

  valuta: "EUR";
  costoTotale?: number;
  caparra?: number;
  pagato?: boolean;

  note?: string;

  createdAt: string;
  updatedAt: string;
}
