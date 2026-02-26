export interface GPXFile {
  id: string;
  viaggioId?: string;
  giornoId: string;
  kind: "planned" | "actual";
  name: string;
  filename?: string;
  uri: string;
  source: "bmw" | "BMW" | "manual";
  startTime: string;
  endTime: string;
  durationMin: number;
  pointsCount: number;
  storagePath?: string;
  downloadUrl?: string;
  rawSizeBytes?: number;
  createdAt: string;
  updatedAt?: string;
  _clientId?: string;
}
