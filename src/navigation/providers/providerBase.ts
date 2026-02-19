export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RoutePayload = {
  from: RoutePoint;
  to: RoutePoint;
  waypoints?: RoutePoint[];
};

export interface Provider {
  id: string;
  label: string;
  isAvailable: () => boolean;
  openRoute: (payload: RoutePayload) => Promise<void>;
}
