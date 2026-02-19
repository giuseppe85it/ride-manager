export interface GPXFile {
  id: string;
  giornoId: string;
  kind: "planned" | "actual";
  name: string;
  uri: string;
  source: "bmw";
  startTime: string;
  endTime: string;
  durationMin: number;
  pointsCount: number;
  createdAt: string;
}
