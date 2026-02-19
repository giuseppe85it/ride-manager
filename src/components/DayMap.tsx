import { useEffect, useMemo } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import type { LatLngExpression } from "leaflet";

interface DayMapPoint {
  lat: number;
  lon: number;
}

interface DayMapProps {
  segments: DayMapPoint[][];
}

function FitSegmentsBounds({ allPoints }: { allPoints: LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (allPoints.length > 1) {
      map.fitBounds(latLngBounds(allPoints), { padding: [24, 24] });
    }
  }, [map, allPoints]);

  return null;
}

export default function DayMap({ segments }: DayMapProps) {
  const validSegments = useMemo(
    () =>
      segments
        .map((segment) => segment.map((point) => [point.lat, point.lon] as LatLngExpression))
        .filter((segment) => segment.length >= 2),
    [segments]
  );

  const allPoints = useMemo(
    () => validSegments.flatMap((segment) => segment),
    [validSegments]
  );

  if (validSegments.length === 0) {
    return <p className="metaText">Traccia non disponibile.</p>;
  }

  return (
    <div className="card" style={{ padding: "0.75rem" }}>
      <div style={{ height: 360, width: "100%", borderRadius: 10, overflow: "hidden" }}>
        <MapContainer center={validSegments[0][0]} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {validSegments.map((segment, index) => (
            <Polyline key={index} positions={segment} pathOptions={{ color: "#1F6FEB", weight: 4 }} />
          ))}
          <FitSegmentsBounds allPoints={allPoints} />
        </MapContainer>
      </div>
    </div>
  );
}
