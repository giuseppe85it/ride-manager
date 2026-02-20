export type LatLonTime = {
  lat: number;
  lon: number;
  time: string;
};

export interface TrackGap {
  fromTime: string;
  toTime: string;
  durationSec: number;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  approxDistanceKm?: number;
}

export interface SegmentationResult {
  segments: LatLonTime[][];
  gaps: TrackGap[];
}

interface SplitOptions {
  gapTimeSec?: number;
}

function haversineDistanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const earthRadiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLon = toRad(to.lon - from.lon);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

export function splitTrackIntoSegments(
  points: LatLonTime[],
  opts: SplitOptions = {}
): SegmentationResult {
  const gapTimeSec = opts.gapTimeSec ?? 60;

  const orderedPoints = points
    .map((point) => ({
      point,
      timeMs: Date.parse(point.time),
    }))
    .filter((item) => !Number.isNaN(item.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);

  if (orderedPoints.length < 2) {
    return { segments: [], gaps: [] };
  }

  const gaps: TrackGap[] = [];
  const segments: LatLonTime[][] = [];
  let currentSegment: LatLonTime[] = [orderedPoints[0].point];

  for (let index = 1; index < orderedPoints.length; index += 1) {
    const previous = orderedPoints[index - 1];
    const current = orderedPoints[index];
    const deltaSec = (current.timeMs - previous.timeMs) / 1000;

    if (deltaSec > gapTimeSec) {
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }

      gaps.push({
        fromTime: previous.point.time,
        toTime: current.point.time,
        durationSec: Math.round(deltaSec),
        from: { lat: previous.point.lat, lon: previous.point.lon },
        to: { lat: current.point.lat, lon: current.point.lon },
        approxDistanceKm: haversineDistanceKm(previous.point, current.point),
      });

      currentSegment = [current.point];
      continue;
    }

    currentSegment.push(current.point);
  }

  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }

  return { segments, gaps };
}
