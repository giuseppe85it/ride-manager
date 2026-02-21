export interface PlannedRoutePoint {
  lat: number;
  lon: number;
}

export interface PlannedRoute {
  engine: "osrm";
  modeRequested: "direct" | "curvy";
  modeApplied: "direct" | "curvy";
  distanceKm: number;
  durationMin: number;
  geometry: PlannedRoutePoint[];
  createdAt: string;
}

export interface Giorno {
  id: string;
  viaggioId: string;
  data: string;
  titolo: string;
  stato: "PIANIFICATO" | "IN_CORSO" | "FATTO";
  note?: string;
  hotelPrenotazioneId?: string;
  plannedMapsUrl?: string;
  plannedRoute?: PlannedRoute;
  createdAt: string;
}
