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

export interface RideSegment {
  id: string;
  type: "RIDE";
  originText: string;
  destinationText: string;
  modeRequested: "direct" | "curvy";
  modeApplied?: "direct" | "curvy";
  distanceKm?: number;
  durationMin?: number;
  geometry?: PlannedRoutePoint[];
}

export interface FerrySegment {
  id: string;
  type: "FERRY";
  departPortText?: string;
  arrivePortText?: string;
  departTimeLocal?: string;
  arriveTimeLocal?: string;
  company?: string;
  note?: string;
}

export type DayPlanSegment = RideSegment | FerrySegment;

export interface DayPlan {
  segments: DayPlanSegment[];
  boardingBufferMin: number;
  createdAt: string;
  updatedAt: string;
}

export interface DayPlanComputed {
  recommendedStartTimeLocal?: string;
  estimatedEndTimeLocal?: string;
  segmentTimes?: Record<string, { start?: string; end?: string }>;
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
  plannedOriginText?: string;
  plannedDestinationText?: string;
  plannedRoute?: PlannedRoute;
  dayPlan?: DayPlan;
  dayPlanComputed?: DayPlanComputed;
  createdAt: string;
}
