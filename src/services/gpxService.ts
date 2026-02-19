import type { GPXFile } from "../models/GPXFile";

export type GPXStats = {
  points: number;
  distanceKm: number;
  durationMin: number;
};

export async function parseGPX(_xml: string): Promise<GPXFile> {
  return {
    name: "TODO",
    tracks: [],
  };
}

export function computeStats(_file: GPXFile): GPXStats {
  return {
    points: 0,
    distanceKm: 0,
    durationMin: 0,
  };
}
