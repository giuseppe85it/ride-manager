export type Coordinate = {
  lat: number;
  lng: number;
};

export interface Viaggio {
  id: string;
  giornoId: string;
  nome: string;
  partenza: Coordinate;
  arrivo: Coordinate;
  waypoints: Coordinate[];
  distanzaKm?: number;
  durataMin?: number;
}
