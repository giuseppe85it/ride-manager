export interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface GPXTrack {
  name?: string;
  points: GPXPoint[];
}

export interface GPXFile {
  name: string;
  tracks: GPXTrack[];
}
