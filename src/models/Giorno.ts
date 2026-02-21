export interface Giorno {
  id: string;
  viaggioId: string;
  data: string;
  titolo: string;
  stato: "PIANIFICATO" | "IN_CORSO" | "FATTO";
  note?: string;
  hotelPrenotazioneId?: string;
  plannedMapsUrl?: string;
  createdAt: string;
}
