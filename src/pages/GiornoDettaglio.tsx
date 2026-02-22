import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  DayPlan,
  FerrySegment,
  Giorno,
  RideSegment,
} from "../models/Giorno";
import type { GPXFile } from "../models/GPXFile";
import type { Prenotazione } from "../models/Prenotazione";
import type { TrackPoint } from "../models/TrackPoint";
import DayMap from "../components/DayMap";
import { reverseGeocode } from "../services/geocodeService";
import { importGPXFile } from "../services/gpxService";
import { calculateTrackDistanceKm } from "../utils/geo";
import { splitTrackIntoSegments } from "../utils/trackSegmentation";
import {
  deleteGPXFile,
  deleteTrackPointsByGpxFileId,
  getGiorno,
  getGPXFilesByGiorno,
  getPrenotazioniByViaggio,
  getPrenotazione,
  getTrackPointsByGiorno,
  saveGiorno,
} from "../services/storage";
import "../styles/theme.css";

interface GiornoDettaglioProps {
  giornoId: string;
  onBack: () => void;
}

interface GeocodeSuggestion {
  displayName: string;
  lat: number;
  lon: number;
}

interface RouteApiSuccessResponse {
  ok: true;
  modeRequested: "direct" | "curvy";
  modeApplied: "direct" | "curvy";
  distanceKm: number;
  durationMin: number;
  geometry: Array<{ lat: number; lon: number }>;
  originResolved: GeocodeSuggestion;
  destinationResolved: GeocodeSuggestion;
}

interface RouteApiErrorResponse {
  ok: false;
  error?: string;
}

interface GoogleLinkRouteStopResolved {
  text: string;
  displayName: string;
  lat: number;
  lon: number;
}

interface GoogleLinkRouteSuccessResponse {
  ok: true;
  modeRequested: "direct" | "curvy";
  modeApplied: "direct" | "curvy";
  expandedUrl: string;
  pointsText: string[];
  stopsResolved: GoogleLinkRouteStopResolved[];
  distanceKm: number;
  durationMin: number;
  geometry: Array<{ lat: number; lon: number }>;
}

type PlannerSearchField = "originText" | "destinationText";

interface PlannerSearchState {
  segmentId: string;
  field: PlannerSearchField;
  isLoading: boolean;
  suggestions: GeocodeSuggestion[];
}

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateIT(iso: string | null): string {
  if (!iso) {
    return "-";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return dateFormatter.format(parsed);
}

function formatTimeIT(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "\u2014";
  }

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function openGoogleMapsDirections(originText: string, destinationText: string): boolean {
  const origin = originText.trim();
  const destination = destinationText.trim();

  if (!origin || !destination) {
    return false;
  }

  const url =
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    "&travelmode=driving";

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

function formatGapDuration(durationSec: number): string {
  const totalMinutes = Math.round(durationSec / 60);
  if (totalMinutes < 1) {
    return "< 1 min";
  }
  if (totalMinutes === 1) {
    return "1 min";
  }
  return `${totalMinutes} min`;
}

function generatePlanSegmentId(prefix = "segment"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDayPlan(): DayPlan {
  const nowIso = new Date().toISOString();
  return {
    segments: [],
    boardingBufferMin: 45,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function isRouteApiSuccessResponse(value: unknown): value is RouteApiSuccessResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as {
    ok?: unknown;
    modeRequested?: unknown;
    modeApplied?: unknown;
    distanceKm?: unknown;
    durationMin?: unknown;
    geometry?: unknown;
    originResolved?: unknown;
    destinationResolved?: unknown;
  };

  if (record.ok !== true) {
    return false;
  }

  if (
    (record.modeRequested !== "direct" && record.modeRequested !== "curvy") ||
    (record.modeApplied !== "direct" && record.modeApplied !== "curvy")
  ) {
    return false;
  }

  if (
    typeof record.distanceKm !== "number" ||
    !Number.isFinite(record.distanceKm) ||
    typeof record.durationMin !== "number" ||
    !Number.isFinite(record.durationMin)
  ) {
    return false;
  }

  if (!Array.isArray(record.geometry) || record.geometry.length < 2) {
    return false;
  }

  for (const point of record.geometry) {
    if (typeof point !== "object" || point === null) {
      return false;
    }
    const lat = (point as { lat?: unknown }).lat;
    const lon = (point as { lon?: unknown }).lon;
    if (
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  for (const endpoint of [record.originResolved, record.destinationResolved]) {
    if (typeof endpoint !== "object" || endpoint === null) {
      return false;
    }
    const displayName = (endpoint as { displayName?: unknown }).displayName;
    const lat = (endpoint as { lat?: unknown }).lat;
    const lon = (endpoint as { lon?: unknown }).lon;
    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  return true;
}

function isGeocodeSuggestionArray(value: unknown): value is GeocodeSuggestion[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const displayName = (item as { displayName?: unknown }).displayName;
    const lat = (item as { lat?: unknown }).lat;
    const lon = (item as { lon?: unknown }).lon;

    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== "number" ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return false;
    }
  }

  return true;
}

function isGoogleLinkRouteSuccessResponse(value: unknown): value is GoogleLinkRouteSuccessResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.ok !== true) {
    return false;
  }
  if (
    (record.modeRequested !== "direct" && record.modeRequested !== "curvy") ||
    (record.modeApplied !== "direct" && record.modeApplied !== "curvy")
  ) {
    return false;
  }
  if (typeof record.expandedUrl !== "string" || !record.expandedUrl.trim()) {
    return false;
  }
  if (!Array.isArray(record.pointsText) || record.pointsText.length < 2) {
    return false;
  }
  if (
    !Array.isArray(record.geometry) ||
    record.geometry.length < 2 ||
    !record.geometry.every(
      (point) =>
        typeof point === "object" &&
        point !== null &&
        typeof (point as { lat?: unknown }).lat === "number" &&
        typeof (point as { lon?: unknown }).lon === "number",
    )
  ) {
    return false;
  }
  if (
    typeof record.distanceKm !== "number" ||
    !Number.isFinite(record.distanceKm) ||
    typeof record.durationMin !== "number" ||
    !Number.isFinite(record.durationMin)
  ) {
    return false;
  }
  if (!Array.isArray(record.stopsResolved) || record.stopsResolved.length < 2) {
    return false;
  }

  return true;
}

export default function GiornoDettaglio({ giornoId, onBack }: GiornoDettaglioProps) {
  const [giorno, setGiorno] = useState<Giorno | null>(null);
  const [hotelPrenotazione, setHotelPrenotazione] = useState<Prenotazione | null>(null);
  const [ferryPrenotazioni, setFerryPrenotazioni] = useState<Prenotazione[]>([]);
  const [gpxFiles, setGpxFiles] = useState<GPXFile[]>([]);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [startLocation, setStartLocation] = useState<string>("N/D");
  const [endLocation, setEndLocation] = useState<string>("N/D");
  const [isResolvingLocations, setIsResolvingLocations] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDestination, setIsSearchingDestination] = useState(false);
  const [routeMode, setRouteMode] = useState<"direct" | "curvy">("direct");
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [plannedMapsUrlDraft, setPlannedMapsUrlDraft] = useState("");
  const [isSavingPlannedMapsUrl, setIsSavingPlannedMapsUrl] = useState(false);
  const [isGeneratingGoogleLinkRoute, setIsGeneratingGoogleLinkRoute] = useState(false);
  const [googleLinkRouteError, setGoogleLinkRouteError] = useState<string | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [plannerSearch, setPlannerSearch] = useState<PlannerSearchState | null>(null);
  const [rideSegmentUiError, setRideSegmentUiError] = useState<{ segmentId: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function reloadDataForDay(targetGiornoId: string): Promise<void> {
    const [gpxRecords, pointRecords, giornoRecord] = await Promise.all([
      getGPXFilesByGiorno(targetGiornoId),
      getTrackPointsByGiorno(targetGiornoId),
      getGiorno(targetGiornoId),
    ]);

    let hotelRecord: Prenotazione | null = null;
    let ferryRecords: Prenotazione[] = [];
    if (giornoRecord?.hotelPrenotazioneId) {
      hotelRecord = (await getPrenotazione(giornoRecord.hotelPrenotazioneId)) ?? null;
    }
    if (giornoRecord?.viaggioId) {
      ferryRecords = (await getPrenotazioniByViaggio(giornoRecord.viaggioId)).filter(
        (prenotazione) => prenotazione.tipo === "TRAGHETTO",
      );
    }

    setGiorno(giornoRecord ?? null);
    setHotelPrenotazione(hotelRecord);
    setFerryPrenotazioni(ferryRecords);
    setGpxFiles(gpxRecords);
    setTrackPoints(pointRecords);
  }

  useEffect(() => {
    let isActive = true;

    async function loadData(): Promise<void> {
      try {
        const [gpxRecords, pointRecords, giornoRecord] = await Promise.all([
          getGPXFilesByGiorno(giornoId),
          getTrackPointsByGiorno(giornoId),
          getGiorno(giornoId),
        ]);
        if (!isActive) {
          return;
        }
        let hotelRecord: Prenotazione | null = null;
        let ferryRecords: Prenotazione[] = [];
        if (giornoRecord?.hotelPrenotazioneId) {
          hotelRecord = (await getPrenotazione(giornoRecord.hotelPrenotazioneId)) ?? null;
          if (!isActive) {
            return;
          }
        }
        if (giornoRecord?.viaggioId) {
          ferryRecords = (await getPrenotazioniByViaggio(giornoRecord.viaggioId)).filter(
            (prenotazione) => prenotazione.tipo === "TRAGHETTO",
          );
          if (!isActive) {
            return;
          }
        }
        setGiorno(giornoRecord ?? null);
        setHotelPrenotazione(hotelRecord);
        setFerryPrenotazioni(ferryRecords);
        setGpxFiles(gpxRecords);
        setTrackPoints(pointRecords);
        setError(null);
      } catch (loadError) {
        if (isActive) {
          const message =
            loadError instanceof Error ? loadError.message : "Errore caricamento dati giorno";
          setError(message);
        }
      }
    }

    void loadData();

    return () => {
      isActive = false;
    };
  }, [giornoId]);

  useEffect(() => {
    if (!giorno) {
      return;
    }

    setOriginText(giorno.plannedOriginText ?? "");
    setDestinationText(giorno.plannedDestinationText ?? "");
    setPlannedMapsUrlDraft(giorno.plannedMapsUrl ?? "");
    if (giorno.plannedRoute) {
      setRouteMode(giorno.plannedRoute.modeRequested);
    }
  }, [giorno]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      await importGPXFile(file, giornoId);
      await reloadDataForDay(giornoId);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Errore import GPX BMW";
      setError(message);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  async function handleDeleteGPX(gpxFileId: string): Promise<void> {
    const confirmed = window.confirm("Confermi la cancellazione di questo GPX?");
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await deleteTrackPointsByGpxFileId(gpxFileId);
      await deleteGPXFile(gpxFileId);
      await reloadDataForDay(giornoId);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Errore cancellazione GPX";
      setError(message);
    }
  }

  async function searchGeocode(
    query: string,
    target: "origin" | "destination",
  ): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      if (target === "origin") {
        setOriginSuggestions([]);
      } else {
        setDestinationSuggestions([]);
      }
      return;
    }

    if (target === "origin") {
      setIsSearchingOrigin(true);
    } else {
      setIsSearchingDestination(true);
    }

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}&limit=5`);
      const payload = (await response.json()) as unknown;

      if (!response.ok || !isGeocodeSuggestionArray(payload)) {
        const message =
          typeof (payload as { error?: unknown })?.error === "string"
            ? (payload as { error: string }).error
            : "Errore geocoding";
        throw new Error(message);
      }

      if (target === "origin") {
        setOriginSuggestions(payload.slice(0, 5));
      } else {
        setDestinationSuggestions(payload.slice(0, 5));
      }
      setError(null);
    } catch (geocodeError) {
      if (target === "origin") {
        setOriginSuggestions([]);
      } else {
        setDestinationSuggestions([]);
      }
      const message = geocodeError instanceof Error ? geocodeError.message : "Errore geocoding";
      setError(message);
    } finally {
      if (target === "origin") {
        setIsSearchingOrigin(false);
      } else {
        setIsSearchingDestination(false);
      }
    }
  }

  function selectOriginSuggestion(suggestion: GeocodeSuggestion): void {
    setOriginText(suggestion.displayName);
    setOriginSuggestions([]);
  }

  function selectDestinationSuggestion(suggestion: GeocodeSuggestion): void {
    setDestinationText(suggestion.displayName);
    setDestinationSuggestions([]);
  }

  function handleUseHotelForDestination(): void {
    if (!hotelPrenotazione) {
      return;
    }

    const candidate = [
      hotelPrenotazione.indirizzo,
      hotelPrenotazione.localita,
      hotelPrenotazione.titolo,
    ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (!candidate) {
      return;
    }

    setDestinationText(candidate.trim());
    setDestinationSuggestions([]);
  }

  async function handleGeneratePlannedRoute(): Promise<void> {
    if (!giorno) {
      setError("Dati giorno non disponibili.");
      return;
    }

    const originTextTrimmed = originText.trim();
    const destinationTextTrimmed = destinationText.trim();
    if (!originTextTrimmed || !destinationTextTrimmed) {
      setError("Inserisci partenza e arrivo.");
      return;
    }

    setIsGeneratingRoute(true);
    setError(null);

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originText: originTextTrimmed,
          destinationText: destinationTextTrimmed,
          mode: routeMode,
        }),
      });

      const payload = (await response.json()) as RouteApiSuccessResponse | RouteApiErrorResponse;

      if (!response.ok || !isRouteApiSuccessResponse(payload)) {
        const message =
          typeof (payload as RouteApiErrorResponse).error === "string"
            ? (payload as RouteApiErrorResponse).error
            : "Errore generazione route";
        throw new Error(message);
      }

      const nextGiorno: Giorno = {
        ...giorno,
        plannedOriginText: payload.originResolved.displayName,
        plannedDestinationText: payload.destinationResolved.displayName,
        plannedRoute: {
          engine: "osrm",
          modeRequested: payload.modeRequested,
          modeApplied: payload.modeApplied,
          distanceKm: payload.distanceKm,
          durationMin: payload.durationMin,
          geometry: payload.geometry,
          createdAt: new Date().toISOString(),
        },
      };

      await saveGiorno(nextGiorno);
      setGiorno(nextGiorno);
      setOriginText(payload.originResolved.displayName);
      setDestinationText(payload.destinationResolved.displayName);
      setOriginSuggestions([]);
      setDestinationSuggestions([]);
    } catch (routeError) {
      const message =
        routeError instanceof Error ? routeError.message : "Errore generazione route";
      setError(message);
    } finally {
      setIsGeneratingRoute(false);
    }
  }

  async function persistGiorno(nextGiorno: Giorno): Promise<void> {
    setGiorno(nextGiorno);
    try {
      await saveGiorno(nextGiorno);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Errore salvataggio giorno";
      setError(message);
    }
  }

  function buildDayPlanFromCurrent(): DayPlan {
    return giorno?.dayPlan
      ? {
          ...giorno.dayPlan,
          segments: giorno.dayPlan.segments.map((segment) =>
            segment.type === "RIDE"
              ? {
                  ...segment,
                  geometry: segment.geometry ? [...segment.geometry] : undefined,
                }
              : { ...segment },
          ),
        }
      : createEmptyDayPlan();
  }

  async function saveDayPlan(nextDayPlan: DayPlan): Promise<void> {
    if (!giorno) {
      return;
    }

    const nextGiorno: Giorno = {
      ...giorno,
      dayPlan: nextDayPlan,
    };

    await persistGiorno(nextGiorno);
  }

  async function updateDayPlan(
    updater: (currentDayPlan: DayPlan) => DayPlan,
  ): Promise<void> {
    const currentDayPlan = buildDayPlanFromCurrent();
    const nextDayPlanBase = updater(currentDayPlan);
    const nextDayPlan: DayPlan = {
      ...nextDayPlanBase,
      updatedAt: new Date().toISOString(),
    };
    await saveDayPlan(nextDayPlan);
  }

  async function handleAddRideSegment(): Promise<void> {
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: [
        ...currentDayPlan.segments,
        {
          id: generatePlanSegmentId("ride"),
          type: "RIDE",
          originText: "",
          destinationText: "",
          modeRequested: "direct",
        } satisfies RideSegment,
      ],
    }));
  }

  async function handleAddFerrySegment(): Promise<void> {
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: [
        ...currentDayPlan.segments,
        {
          id: generatePlanSegmentId("ferry"),
          type: "FERRY",
        } satisfies FerrySegment,
      ],
    }));
  }

  async function handleAddRideSegmentBeforeFirstFerry(destinationText: string): Promise<void> {
    const destination = destinationText.trim();
    if (!destination) {
      setError("Seleziona prima un traghetto con porto di partenza.");
      return;
    }

    await updateDayPlan((currentDayPlan) => {
      const firstFerryIndex = currentDayPlan.segments.findIndex((segment) => segment.type === "FERRY");
      const nextRide: RideSegment = {
        id: generatePlanSegmentId("ride"),
        type: "RIDE",
        originText: "",
        destinationText: destination,
        modeRequested: "direct",
      };

      if (firstFerryIndex < 0) {
        return {
          ...currentDayPlan,
          segments: [...currentDayPlan.segments, nextRide],
        };
      }

      return {
        ...currentDayPlan,
        segments: [
          ...currentDayPlan.segments.slice(0, firstFerryIndex),
          nextRide,
          ...currentDayPlan.segments.slice(firstFerryIndex),
        ],
      };
    });
    setError(null);
  }

  async function handleDeletePlanSegment(segmentId: string): Promise<void> {
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: currentDayPlan.segments.filter((segment) => segment.id !== segmentId),
    }));
    setPlannerSearch((current) => (current?.segmentId === segmentId ? null : current));
  }

  async function handleBoardingBufferChange(value: string): Promise<void> {
    const parsed = Number.parseInt(value, 10);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      boardingBufferMin: safeValue,
    }));
  }

  async function handleRideSegmentFieldChange(
    segmentId: string,
    field: keyof Pick<RideSegment, "originText" | "destinationText">,
    value: string,
  ): Promise<void> {
    setRideSegmentUiError((current) => (current?.segmentId === segmentId ? null : current));
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: currentDayPlan.segments.map((segment) =>
        segment.id !== segmentId || segment.type !== "RIDE"
          ? segment
          : {
              ...segment,
              [field]: value,
            },
      ),
    }));
  }

  async function handleRideSegmentModeChange(
    segmentId: string,
    modeRequested: "direct" | "curvy",
  ): Promise<void> {
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: currentDayPlan.segments.map((segment) =>
        segment.id !== segmentId || segment.type !== "RIDE"
          ? segment
          : {
              ...segment,
              modeRequested,
            },
      ),
    }));
  }

  async function handleFerrySegmentFieldChange(
    segmentId: string,
    field: keyof Pick<
      FerrySegment,
      "prenotazioneId" | "departPortText" | "arrivePortText" | "company" | "note"
    >,
    value: string,
  ): Promise<void> {
    await updateDayPlan((currentDayPlan) => ({
      ...currentDayPlan,
      segments: currentDayPlan.segments.map((segment) =>
        segment.id !== segmentId || segment.type !== "FERRY"
          ? segment
          : {
              ...segment,
              [field]: value.trim() ? value : undefined,
            },
      ),
    }));
  }

  async function handlePlannerSearch(
    segmentId: string,
    field: PlannerSearchField,
    query: string,
  ): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      setPlannerSearch(null);
      return;
    }

    setPlannerSearch({
      segmentId,
      field,
      isLoading: true,
      suggestions: [],
    });

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}&limit=5`);
      const payload = (await response.json()) as unknown;

      if (!response.ok || !isGeocodeSuggestionArray(payload)) {
        const message =
          typeof (payload as { error?: unknown })?.error === "string"
            ? (payload as { error: string }).error
            : "Errore geocoding";
        throw new Error(message);
      }

      setPlannerSearch({
        segmentId,
        field,
        isLoading: false,
        suggestions: payload.slice(0, 5),
      });
      setError(null);
    } catch (searchError) {
      setPlannerSearch({
        segmentId,
        field,
        isLoading: false,
        suggestions: [],
      });
      const message = searchError instanceof Error ? searchError.message : "Errore geocoding";
      setError(message);
    }
  }

  async function handlePlannerSuggestionSelect(
    segmentId: string,
    field: PlannerSearchField,
    suggestion: GeocodeSuggestion,
  ): Promise<void> {
    await handleRideSegmentFieldChange(segmentId, field, suggestion.displayName);
    setPlannerSearch(null);
  }

  async function handleUseHotelDestinationForSegment(segmentId: string): Promise<void> {
    const indirizzo = typeof hotelPrenotazione?.indirizzo === "string" ? hotelPrenotazione.indirizzo.trim() : "";
    const localita = typeof hotelPrenotazione?.localita === "string" ? hotelPrenotazione.localita.trim() : "";
    const titolo = typeof hotelPrenotazione?.titolo === "string" ? hotelPrenotazione.titolo.trim() : "";
    const combinedHotel = [titolo, localita].filter((part) => part.length > 0).join(" ");
    const addressLike = [indirizzo, localita].filter((part) => part.length > 0).join(" ");
    const candidate = addressLike || (localita ? combinedHotel : "");

    if (!candidate) {
      const message = "Hotel del giorno non ha indirizzo/localita: completa la prenotazione hotel";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    await handleRideSegmentFieldChange(segmentId, "destinationText", candidate.trim());
    setRideSegmentUiError((current) => (current?.segmentId === segmentId ? null : current));
    setError(null);
    setPlannerSearch(null);
  }

  async function handleCalculateRideSegment(segmentId: string): Promise<void> {
    const currentDayPlan = giorno?.dayPlan;
    if (!giorno || !currentDayPlan) {
      setError("Planner giorno non disponibile.");
      return;
    }

    const segment = currentDayPlan.segments.find(
      (item): item is RideSegment => item.id === segmentId && item.type === "RIDE",
    );

    if (!segment) {
      const message = "Segmento moto non trovato.";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    const originTextTrimmed = segment.originText.trim();
    const destinationTextTrimmed = segment.destinationText.trim();
    if (!originTextTrimmed || !destinationTextTrimmed) {
      const message =
        "Inserisci Partenza e Arrivo (seleziona un suggerimento o usa Hotel del giorno)";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    setIsGeneratingRoute(true);
    setRideSegmentUiError((current) => (current?.segmentId === segmentId ? null : current));
    setError(null);

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originText: originTextTrimmed,
          destinationText: destinationTextTrimmed,
          mode: segment.modeRequested,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | RouteApiSuccessResponse
        | RouteApiErrorResponse
        | null;
      if (!response.ok || !isRouteApiSuccessResponse(payload)) {
        const message =
          typeof (payload as RouteApiErrorResponse | null)?.error === "string"
            ? (payload as RouteApiErrorResponse).error
            : "Errore calcolo tratta (verifica Partenza/Arrivo)";
        console.error("handleCalculateRideSegment /api/route failed", {
          status: response.status,
          segmentId,
          originText: originTextTrimmed,
          destinationText: destinationTextTrimmed,
          payload,
        });
        throw new Error(message);
      }

      const nextDayPlan: DayPlan = {
        ...currentDayPlan,
        updatedAt: new Date().toISOString(),
        segments: currentDayPlan.segments.map((item) =>
          item.id !== segmentId || item.type !== "RIDE"
            ? item
            : {
                ...item,
                originText: payload.originResolved.displayName,
                destinationText: payload.destinationResolved.displayName,
                modeRequested: payload.modeRequested,
                modeApplied: payload.modeApplied,
                distanceKm: payload.distanceKm,
                durationMin: payload.durationMin,
                geometry: payload.geometry,
              },
        ),
      };

      await saveDayPlan(nextDayPlan);
      setPlannerSearch(null);
      setRideSegmentUiError((current) => (current?.segmentId === segmentId ? null : current));
    } catch (routeError) {
      const message =
        routeError instanceof Error
          ? routeError.message
          : "Errore calcolo tratta (verifica Partenza/Arrivo)";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
    } finally {
      setIsGeneratingRoute(false);
    }
  }

  function handleOpenRideSegmentNavigation(segmentId: string): void {
    const currentDayPlan = giorno?.dayPlan;
    if (!currentDayPlan) {
      const message = "Planner giorno non disponibile.";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    const segment = currentDayPlan.segments.find(
      (item): item is RideSegment => item.id === segmentId && item.type === "RIDE",
    );

    if (!segment) {
      const message = "Segmento moto non trovato.";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    const opened = openGoogleMapsDirections(segment.originText, segment.destinationText);
    if (!opened) {
      const message = "Inserisci Partenza e Arrivo prima di avviare la navigazione";
      setRideSegmentUiError({ segmentId, message });
      setError(message);
      return;
    }

    setRideSegmentUiError((current) => (current?.segmentId === segmentId ? null : current));
    setError(null);
  }

  const orderedTrackPoints = useMemo(() => {
    return trackPoints
      .map((trackPoint) => ({
        ...trackPoint,
        timeMs: Date.parse(trackPoint.time),
      }))
      .filter((trackPoint) => !Number.isNaN(trackPoint.timeMs))
      .sort((left, right) => left.timeMs - right.timeMs);
  }, [trackPoints]);

  const firstPointTime = orderedTrackPoints.length > 0 ? orderedTrackPoints[0].time : null;
  const lastPointTime =
    orderedTrackPoints.length > 0 ? orderedTrackPoints[orderedTrackPoints.length - 1].time : null;
  const firstPoint = orderedTrackPoints.length > 0 ? orderedTrackPoints[0] : null;
  const lastPoint = orderedTrackPoints.length > 0 ? orderedTrackPoints[orderedTrackPoints.length - 1] : null;
  const distanzaKm = useMemo(
    () => calculateTrackDistanceKm(orderedTrackPoints),
    [orderedTrackPoints]
  );
  const distanzaKmRounded = distanzaKm.toFixed(1);
  const segmentation = useMemo(
    () =>
      splitTrackIntoSegments(
        orderedTrackPoints.map((point) => ({
          lat: point.lat,
          lon: point.lon,
          time: point.time,
        })),
        { gapTimeSec: 60 }
      ),
    [orderedTrackPoints]
  );
  const segments = segmentation.segments;
  const gaps = segmentation.gaps;
  const displayedGaps = showAllGaps ? gaps : gaps.slice(0, 3);

  useEffect(() => {
    setShowAllGaps(false);
  }, [gaps.length]);

  useEffect(() => {
    let isActive = true;

    async function loadLocations(): Promise<void> {
      if (!firstPoint || !lastPoint) {
        setStartLocation("N/D");
        setEndLocation("N/D");
        setIsResolvingLocations(false);
        return;
      }

      setStartLocation("...");
      setEndLocation("...");
      setIsResolvingLocations(true);

      const sameCoordinates = firstPoint.lat === lastPoint.lat && firstPoint.lon === lastPoint.lon;
      if (sameCoordinates) {
        const label = await reverseGeocode(firstPoint.lat, firstPoint.lon);
        if (!isActive) {
          return;
        }
        const location = label ?? "N/D";
        setStartLocation(location);
        setEndLocation(location);
        setIsResolvingLocations(false);
        return;
      }

      const [startLabel, endLabel] = await Promise.all([
        reverseGeocode(firstPoint.lat, firstPoint.lon),
        reverseGeocode(lastPoint.lat, lastPoint.lon),
      ]);

      if (!isActive) {
        return;
      }

      setStartLocation(startLabel ?? "N/D");
      setEndLocation(endLabel ?? "N/D");
      setIsResolvingLocations(false);
    }

    void loadLocations();

    return () => {
      isActive = false;
    };
  }, [firstPoint?.lat, firstPoint?.lon, lastPoint?.lat, lastPoint?.lon]);

  function handleOpenPlannedMap(): void {
    if (!giorno?.plannedMapsUrl) {
      return;
    }
    window.open(giorno.plannedMapsUrl, "_blank", "noopener,noreferrer");
  }

  function isValidHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
  }

  async function handleSavePlannedMapsUrlFromDraft(): Promise<void> {
    if (!giorno) {
      return;
    }

    const trimmed = plannedMapsUrlDraft.trim();
    if (trimmed && !isValidHttpUrl(trimmed)) {
      setError("Il link Google Maps deve iniziare con http.");
      return;
    }

    setIsSavingPlannedMapsUrl(true);
    setError(null);
    try {
      await persistGiorno({
        ...giorno,
        plannedMapsUrl: trimmed || undefined,
      });
    } finally {
      setIsSavingPlannedMapsUrl(false);
    }
  }

  function handleOpenGoogleMapsFromDraft(): void {
    const trimmed = plannedMapsUrlDraft.trim();
    if (!trimmed) {
      setGoogleLinkRouteError("Incolla il link Google Maps del giorno.");
      setError("Incolla il link Google Maps del giorno.");
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setGoogleLinkRouteError("Il link Google Maps deve iniziare con http.");
      setError("Il link Google Maps deve iniziare con http.");
      return;
    }
    setGoogleLinkRouteError(null);
    setError(null);
    window.open(trimmed, "_blank", "noopener,noreferrer");
  }

  async function handleGenerateRouteFromGoogleLink(): Promise<void> {
    if (!giorno) {
      setError("Dati giorno non disponibili.");
      return;
    }

    const trimmed = plannedMapsUrlDraft.trim();
    if (!trimmed) {
      const message = "Incolla il link Google Maps del giorno.";
      setGoogleLinkRouteError(message);
      setError(message);
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      const message = "Il link Google Maps deve iniziare con http.";
      setGoogleLinkRouteError(message);
      setError(message);
      return;
    }

    setIsGeneratingGoogleLinkRoute(true);
    setGoogleLinkRouteError(null);
    setError(null);

    try {
      const response = await fetch("/api/google/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: trimmed,
          mode: routeMode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | GoogleLinkRouteSuccessResponse
        | RouteApiErrorResponse
        | null;

      if (!response.ok || !isGoogleLinkRouteSuccessResponse(payload)) {
        const message =
          typeof (payload as RouteApiErrorResponse | null)?.error === "string"
            ? (payload as RouteApiErrorResponse).error
            : "Link non interpretabile o route non disponibile";
        throw new Error(message);
      }

      const nextGiorno: Giorno = {
        ...giorno,
        plannedMapsUrl: trimmed,
        plannedOriginText: payload.pointsText[0],
        plannedDestinationText: payload.pointsText[payload.pointsText.length - 1],
        plannedRoute: {
          engine: "osrm",
          modeRequested: payload.modeRequested,
          modeApplied: payload.modeApplied,
          source: "google-link",
          pointsText: payload.pointsText,
          expandedUrl: payload.expandedUrl,
          distanceKm: payload.distanceKm,
          durationMin: payload.durationMin,
          geometry: payload.geometry,
          createdAt: new Date().toISOString(),
        },
      };

      await persistGiorno(nextGiorno);
      setPlannedMapsUrlDraft(trimmed);
      setGoogleLinkRouteError(null);
    } catch (routeError) {
      const message =
        routeError instanceof Error ? routeError.message : "Errore generazione mappa da Google Link";
      setGoogleLinkRouteError(message);
      setError(message);
    } finally {
      setIsGeneratingGoogleLinkRoute(false);
    }
  }

  function handleOpenHotelMap(): void {
    const queryParts = [hotelPrenotazione?.titolo, hotelPrenotazione?.localita, hotelPrenotazione?.indirizzo]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    if (queryParts.length === 0) {
      return;
    }

    const query = encodeURIComponent(queryParts.join(", "));
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const canOpenHotelMap = Boolean(
    hotelPrenotazione &&
      [hotelPrenotazione.titolo, hotelPrenotazione.localita, hotelPrenotazione.indirizzo].some(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
  );
  const hotelDestinationCandidate =
    [hotelPrenotazione?.indirizzo, hotelPrenotazione?.localita, hotelPrenotazione?.titolo].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ) ?? null;
  const canUseHotelForDestination = Boolean(hotelDestinationCandidate);
  const dayPlan = giorno?.dayPlan;
  const timelineSegmentsCount = dayPlan?.segments.length ?? 0;
  const hasTimelineSegments = timelineSegmentsCount > 0;
  const ferryPrenotazioniById = useMemo(
    () =>
      new Map(
        ferryPrenotazioni.map((prenotazione) => [prenotazione.id, prenotazione] as const),
      ),
    [ferryPrenotazioni],
  );
  const firstTimelineFerryWithBooking = useMemo(() => {
    if (!dayPlan) {
      return null;
    }

    for (const segment of dayPlan.segments) {
      if (segment.type !== "FERRY" || !segment.prenotazioneId) {
        continue;
      }
      const prenotazione = ferryPrenotazioniById.get(segment.prenotazioneId);
      if (prenotazione) {
        return { segment, prenotazione };
      }
    }

    return null;
  }, [dayPlan, ferryPrenotazioniById]);
  const rideToPortDestinationCandidate = useMemo(() => {
    const prenotazione = firstTimelineFerryWithBooking?.prenotazione;
    if (!prenotazione) {
      return null;
    }

    const portoPartenza = typeof prenotazione.portoPartenza === "string" ? prenotazione.portoPartenza.trim() : "";
    const localita = typeof prenotazione.localita === "string" ? prenotazione.localita.trim() : "";
    const titolo = typeof prenotazione.titolo === "string" ? prenotazione.titolo.trim() : "";

    if (portoPartenza && localita) {
      return `${portoPartenza} ${localita}`;
    }
    if (portoPartenza) {
      return portoPartenza;
    }
    if (localita) {
      return `${localita} porto`;
    }
    if (titolo) {
      return titolo;
    }
    return null;
  }, [firstTimelineFerryWithBooking]);
  const canAddRideToPort = Boolean(rideToPortDestinationCandidate);
  const dayPlanRideSegmentsForMap = useMemo(
    () =>
      (dayPlan?.segments ?? [])
        .filter((segment): segment is RideSegment => segment.type === "RIDE")
        .filter((segment) => Array.isArray(segment.geometry) && segment.geometry.length >= 2)
        .map((segment) => segment.geometry as NonNullable<RideSegment["geometry"]>),
    [dayPlan],
  );

  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="toolbar">
          <button type="button" onClick={onBack} className="buttonGhost">
            {"\u2190"} Dettaglio viaggio
          </button>
          <h1 className="pageTitle">Giorno dettaglio</h1>
        </div>
        {import.meta.env.DEV && (
          <p className="metaText" style={{ margin: "0 0 0.75rem 0" }}>
            Timeline segments: {timelineSegmentsCount}
          </p>
        )}

        <div className="card detailCard" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.6rem 0" }}>Pianificazione (Google Maps)</h2>
          <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
            Fonte primaria del giorno: incolla il link Google Maps e usa VAI.
          </p>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <input
              type="url"
              className="inputField"
              value={plannedMapsUrlDraft}
              onChange={(event) => setPlannedMapsUrlDraft(event.target.value)}
              onBlur={() => void handleSavePlannedMapsUrlFromDraft()}
              placeholder="Incolla URL Google Maps del giorno"
            />
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="buttonPrimary"
                onClick={handleOpenGoogleMapsFromDraft}
                disabled={!plannedMapsUrlDraft.trim()}
              >
                VAI (Google Maps)
              </button>
              <button
                type="button"
                className="buttonGhost"
                onClick={() => void handleSavePlannedMapsUrlFromDraft()}
                disabled={isSavingPlannedMapsUrl}
              >
                {isSavingPlannedMapsUrl ? "Salvataggio..." : "Salva link"}
              </button>
              <select
                className="inputField"
                value={routeMode}
                onChange={(event) => setRouteMode(event.target.value as "direct" | "curvy")}
                style={{ width: 150 }}
              >
                <option value="direct">Direct</option>
                <option value="curvy">Curvy</option>
              </select>
              <button
                type="button"
                className="buttonPrimary"
                onClick={() => void handleGenerateRouteFromGoogleLink()}
                disabled={isGeneratingGoogleLinkRoute || !plannedMapsUrlDraft.trim()}
              >
                {isGeneratingGoogleLinkRoute ? "Generazione..." : "Genera mappa da Google Link"}
              </button>
            </div>
            {googleLinkRouteError && (
              <p className="errorText" style={{ margin: "0.15rem 0 0 0" }}>
                {googleLinkRouteError}
              </p>
            )}

            {giorno?.plannedRoute?.source === "google-link" &&
              Array.isArray(giorno.plannedRoute.geometry) &&
              giorno.plannedRoute.geometry.length >= 2 && (
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <p className="metaText" style={{ margin: 0 }}>
                    Percorso ricostruito da punti Google (puo differire dal percorso esatto di Google).
                  </p>
                  <p className="metaText" style={{ margin: 0 }}>
                    Distanza stimata: {giorno.plannedRoute.distanceKm.toFixed(2)} km · Durata stimata:{" "}
                    {giorno.plannedRoute.durationMin.toFixed(1)} min
                  </p>
                  {Array.isArray(giorno.plannedRoute.pointsText) && giorno.plannedRoute.pointsText.length >= 2 && (
                    <p className="metaText" style={{ margin: 0 }}>
                      Punti: {giorno.plannedRoute.pointsText.join(" → ")}
                    </p>
                  )}
                  <DayMap segments={[giorno.plannedRoute.geometry]} />
                </div>
              )}
          </div>
        </div>

        <details className="card detailCard" style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: "0.6rem" }}>
            Avanzate (opzionale)
          </summary>
          <p className="metaText" style={{ margin: "0 0 0.75rem 0" }}>
            Timeline RIDE/FERRY e pianificazione OSRM/Nominatim restano disponibili, ma la fonte primaria e il link
            Google Maps del giorno.
          </p>

        <div className="card detailCard" style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0 }}>PIANIFICAZIONE GIORNO (TIMELINE)</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <label htmlFor="boarding-buffer" className="metaText">
                Buffer imbarco (min)
              </label>
              <input
                id="boarding-buffer"
                type="number"
                min={0}
                value={dayPlan?.boardingBufferMin ?? 45}
                onChange={(event) => void handleBoardingBufferChange(event.target.value)}
                className="inputField"
                style={{ width: 96 }}
              />
            </div>
          </div>

          <div className="toolbar" style={{ marginBottom: "0.75rem", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="buttonPrimary" onClick={() => void handleAddRideSegment()}>
              + Tratta moto
            </button>
            {dayPlan && (
              <button
                type="button"
                className="buttonGhost"
                onClick={() =>
                  void handleAddRideSegmentBeforeFirstFerry(rideToPortDestinationCandidate ?? "")
                }
                disabled={!canAddRideToPort}
                title={
                  canAddRideToPort
                    ? `Precompila arrivo: ${rideToPortDestinationCandidate}`
                    : "Seleziona un segmento traghetto con prenotazione e porto di partenza"
                }
              >
                + Tratta verso porto
              </button>
            )}
            <button type="button" className="buttonGhost" onClick={() => void handleAddFerrySegment()}>
              + Traghetto
            </button>
          </div>

          {!dayPlan || dayPlan.segments.length === 0 ? (
            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <p className="metaText" style={{ margin: 0 }}>
                Nessun segmento timeline. Aggiungi una tratta moto o un traghetto.
              </p>
              <div>
                <button type="button" className="buttonPrimary" onClick={() => void handleAddRideSegment()}>
                  Crea timeline
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem", marginBottom: "0.75rem" }}>
              {dayPlan.segments.map((segment, index) => {
                const showSearchOrigin =
                  plannerSearch?.segmentId === segment.id &&
                  plannerSearch.field === "originText" &&
                  plannerSearch.suggestions.length > 0;
                const showSearchDestination =
                  plannerSearch?.segmentId === segment.id &&
                  plannerSearch.field === "destinationText" &&
                  plannerSearch.suggestions.length > 0;

                if (segment.type === "RIDE") {
                  return (
                    <div key={segment.id} className="card detailCard" style={{ padding: "0.75rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          alignItems: "center",
                          flexWrap: "wrap",
                          marginBottom: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span className="badge">RIDE</span>
                          <strong>Tratta moto {index + 1}</strong>
                        </div>
                        <button
                          type="button"
                          className="buttonGhost"
                          onClick={() => void handleDeletePlanSegment(segment.id)}
                        >
                          Rimuovi
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: "0.75rem",
                          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        }}
                      >
                        <div style={{ display: "grid", gap: "0.45rem", alignContent: "start" }}>
                          <label style={{ fontWeight: 600 }}>Partenza</label>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <input
                              type="text"
                              className="inputField"
                              value={segment.originText}
                              onChange={(event) =>
                                void handleRideSegmentFieldChange(segment.id, "originText", event.target.value)
                              }
                              placeholder="Citta / indirizzo"
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              className="buttonGhost"
                              onClick={() => void handlePlannerSearch(segment.id, "originText", segment.originText)}
                              disabled={
                                plannerSearch?.segmentId === segment.id &&
                                plannerSearch.field === "originText" &&
                                plannerSearch.isLoading
                              }
                            >
                              {plannerSearch?.segmentId === segment.id &&
                              plannerSearch.field === "originText" &&
                              plannerSearch.isLoading
                                ? "..."
                                : "Cerca"}
                            </button>
                          </div>
                          {showSearchOrigin && (
                            <ul className="listPlain card" style={{ margin: 0, padding: "0.4rem" }}>
                              {plannerSearch.suggestions.map((suggestion, suggestionIndex) => (
                                <li key={`${suggestion.displayName}-${suggestionIndex}`}>
                                  <button
                                    type="button"
                                    className="itemButton"
                                    onClick={() =>
                                      void handlePlannerSuggestionSelect(segment.id, "originText", suggestion)
                                    }
                                  >
                                    {suggestion.displayName}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div style={{ display: "grid", gap: "0.45rem", alignContent: "start" }}>
                          <label style={{ fontWeight: 600 }}>Arrivo</label>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <input
                              type="text"
                              className="inputField"
                              value={segment.destinationText}
                              onChange={(event) =>
                                void handleRideSegmentFieldChange(segment.id, "destinationText", event.target.value)
                              }
                              placeholder="Citta / indirizzo"
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              className="buttonGhost"
                              onClick={() =>
                                void handlePlannerSearch(segment.id, "destinationText", segment.destinationText)
                              }
                              disabled={
                                plannerSearch?.segmentId === segment.id &&
                                plannerSearch.field === "destinationText" &&
                                plannerSearch.isLoading
                              }
                            >
                              {plannerSearch?.segmentId === segment.id &&
                              plannerSearch.field === "destinationText" &&
                              plannerSearch.isLoading
                                ? "..."
                                : "Cerca"}
                            </button>
                          </div>
                          {showSearchDestination && (
                            <ul className="listPlain card" style={{ margin: 0, padding: "0.4rem" }}>
                              {plannerSearch.suggestions.map((suggestion, suggestionIndex) => (
                                <li key={`${suggestion.displayName}-${suggestionIndex}`}>
                                  <button
                                    type="button"
                                    className="itemButton"
                                    onClick={() =>
                                      void handlePlannerSuggestionSelect(
                                        segment.id,
                                        "destinationText",
                                        suggestion,
                                      )
                                    }
                                  >
                                    {suggestion.displayName}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div>
                            <button
                              type="button"
                              className="buttonGhost"
                              onClick={() => void handleUseHotelDestinationForSegment(segment.id)}
                              disabled={!canUseHotelForDestination}
                            >
                              {canUseHotelForDestination ? "Usa Hotel del giorno" : "Seleziona Hotel del giorno"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          marginTop: "0.65rem",
                          alignItems: "center",
                        }}
                      >
                        <select
                          className="inputField"
                          value={segment.modeRequested}
                          onChange={(event) =>
                            void handleRideSegmentModeChange(
                              segment.id,
                              event.target.value as "direct" | "curvy",
                            )
                          }
                          style={{ width: 140 }}
                        >
                          <option value="direct">Direct</option>
                          <option value="curvy">Curvy</option>
                        </select>
                        <button
                          type="button"
                          className="buttonPrimary"
                          onClick={() => void handleCalculateRideSegment(segment.id)}
                          disabled={isGeneratingRoute}
                        >
                          {isGeneratingRoute ? "Calcolo..." : "Calcola tratta"}
                        </button>
                        <button
                          type="button"
                          className="buttonPrimary"
                          onClick={() => handleOpenRideSegmentNavigation(segment.id)}
                        >
                          VAI
                        </button>
                        <span className="badge" style={{ whiteSpace: "nowrap" }}>
                          {segment.modeRequested.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.25rem" }}>
                        <p className="metaText" style={{ margin: 0 }}>
                          Distanza:{" "}
                          {typeof segment.distanceKm === "number" ? `${segment.distanceKm.toFixed(2)} km` : "\u2014"}
                        </p>
                        <p className="metaText" style={{ margin: 0 }}>
                          Durata:{" "}
                          {typeof segment.durationMin === "number" ? `${segment.durationMin.toFixed(1)} min` : "\u2014"}
                        </p>
                        <p className="metaText" style={{ margin: 0 }}>
                          Mode applicato: {segment.modeApplied ?? "\u2014"}
                        </p>
                        {rideSegmentUiError?.segmentId === segment.id && (
                          <p className="errorText" style={{ margin: "0.25rem 0 0 0" }}>
                            {rideSegmentUiError.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                const ferryBooking = segment.prenotazioneId
                  ? (ferryPrenotazioniById.get(segment.prenotazioneId) ?? null)
                  : null;
                const ferryHasTimes = Boolean(ferryBooking?.oraInizio && ferryBooking?.oraFine);
                return (
                  <div key={segment.id} className="card detailCard" style={{ padding: "0.75rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: "0.6rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="badge" style={{ borderColor: "#E11D48", color: "#E11D48" }}>
                          FERRY
                        </span>
                        <strong>Traghetto {index + 1}</strong>
                      </div>
                      <button
                        type="button"
                        className="buttonGhost"
                        onClick={() => void handleDeletePlanSegment(segment.id)}
                      >
                        Rimuovi
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "0.6rem",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      }}
                    >
                      <select
                        className="inputField"
                        value={segment.prenotazioneId ?? ""}
                        onChange={(event) =>
                          void handleFerrySegmentFieldChange(segment.id, "prenotazioneId", event.target.value)
                        }
                      >
                        <option value="">Traghetto (prenotazione)</option>
                        {ferryPrenotazioni.map((prenotazione) => (
                          <option key={prenotazione.id} value={prenotazione.id}>
                            {prenotazione.titolo}
                            {prenotazione.localita ? ` - ${prenotazione.localita}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="inputField"
                        placeholder="Porto partenza (opz.)"
                        value={segment.departPortText ?? ""}
                        onChange={(event) =>
                          void handleFerrySegmentFieldChange(segment.id, "departPortText", event.target.value)
                        }
                      />
                      <input
                        type="text"
                        className="inputField"
                        placeholder="Porto arrivo (opz.)"
                        value={segment.arrivePortText ?? ""}
                        onChange={(event) =>
                          void handleFerrySegmentFieldChange(segment.id, "arrivePortText", event.target.value)
                        }
                      />
                      <input
                        type="text"
                        className="inputField"
                        placeholder="Compagnia (opz.)"
                        value={segment.company ?? ""}
                        onChange={(event) =>
                          void handleFerrySegmentFieldChange(segment.id, "company", event.target.value)
                        }
                      />
                      <input
                        type="text"
                        className="inputField"
                        placeholder="Note (opz.)"
                        value={segment.note ?? ""}
                        onChange={(event) =>
                          void handleFerrySegmentFieldChange(segment.id, "note", event.target.value)
                        }
                      />
                    </div>

                    <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.25rem" }}>
                      <p className="metaText" style={{ margin: 0 }}>
                        Prenotazione: {ferryBooking?.titolo ?? "\u2014"}
                      </p>
                      <p className="metaText" style={{ margin: 0 }}>
                        Data: {ferryBooking?.dataInizio ? formatDateIT(ferryBooking.dataInizio) : "\u2014"}
                      </p>
                      <p className="metaText" style={{ margin: 0 }}>
                        Ora partenza: {ferryBooking?.oraInizio ?? "\u2014"}
                      </p>
                      <p className="metaText" style={{ margin: 0 }}>
                        Ora arrivo: {ferryBooking?.oraFine ?? "\u2014"}
                      </p>
                      {(ferryBooking?.portoPartenza || ferryBooking?.portoArrivo) && (
                        <p className="metaText" style={{ margin: 0 }}>
                          Porto: {ferryBooking?.portoPartenza ?? "\u2014"} {"\u2192"}{" "}
                          {ferryBooking?.portoArrivo ?? "\u2014"}
                        </p>
                      )}
                      {segment.prenotazioneId && ferryBooking && !ferryHasTimes && (
                        <p className="errorText" style={{ margin: 0 }}>
                          Mancano orari nella prenotazione traghetto
                        </p>
                      )}
                      {segment.prenotazioneId && !ferryBooking && (
                        <p className="errorText" style={{ margin: 0 }}>
                          Prenotazione traghetto non trovata
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginBottom: "0.75rem" }}>
            <h3 style={{ margin: "0 0 0.45rem 0", fontSize: "1rem" }}>Preview mappa planned (RIDE)</h3>
            {dayPlanRideSegmentsForMap.length > 0 ? (
              <DayMap segments={dayPlanRideSegmentsForMap} />
            ) : (
              <p className="metaText">Nessuna tratta moto calcolata nel planner.</p>
            )}
          </div>
        </div>

        <details className="card detailCard" style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: "0.6rem" }}>
            Pianificazione legacy (opzionale)
          </summary>
          <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
            Usa la TIMELINE sopra per le tratte navigabili (VAI).
          </p>
          <h2 style={{ margin: "0 0 0.6rem 0" }}>Pianificazione</h2>
          <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
            Routing locale OSRM con geocoding Nominatim (input testo).
          </p>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginBottom: "0.7rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.5rem", alignContent: "start" }}>
              <label style={{ fontWeight: 600 }}>Partenza</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="inputField"
                  value={originText}
                  onChange={(event) => setOriginText(event.target.value)}
                  placeholder='Es. "Bastia" o indirizzo'
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void searchGeocode(originText, "origin")}
                  disabled={isSearchingOrigin || !originText.trim()}
                >
                  {isSearchingOrigin ? "..." : "Cerca"}
                </button>
              </div>
              {originSuggestions.length > 0 && (
                <ul className="listPlain card" style={{ padding: "0.4rem", margin: 0 }}>
                  {originSuggestions.map((suggestion, index) => (
                    <li key={`${suggestion.displayName}-${index}`}>
                      <button
                        type="button"
                        className="itemButton"
                        onClick={() => selectOriginSuggestion(suggestion)}
                      >
                        {suggestion.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: "grid", gap: "0.5rem", alignContent: "start" }}>
              <label style={{ fontWeight: 600 }}>Arrivo</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="inputField"
                  value={destinationText}
                  onChange={(event) => setDestinationText(event.target.value)}
                  placeholder='Es. "Saint-Florent" o indirizzo'
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => void searchGeocode(destinationText, "destination")}
                  disabled={isSearchingDestination || !destinationText.trim()}
                >
                  {isSearchingDestination ? "..." : "Cerca"}
                </button>
              </div>
              {destinationSuggestions.length > 0 && (
                <ul className="listPlain card" style={{ padding: "0.4rem", margin: 0 }}>
                  {destinationSuggestions.map((suggestion, index) => (
                    <li key={`${suggestion.displayName}-${index}`}>
                      <button
                        type="button"
                        className="itemButton"
                        onClick={() => selectDestinationSuggestion(suggestion)}
                      >
                        {suggestion.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={handleUseHotelForDestination}
                  disabled={!canUseHotelForDestination}
                >
                  Usa Hotel del giorno
                </button>
              </div>
            </div>

            <select
              className="inputField"
              value={routeMode}
              onChange={(event) => setRouteMode(event.target.value as "direct" | "curvy")}
            >
              <option value="direct">Direct</option>
              <option value="curvy">Curvy</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGeneratePlannedRoute()}
            className="buttonPrimary"
            disabled={isGeneratingRoute}
          >
            {isGeneratingRoute ? "Generazione..." : "Genera percorso"}
          </button>

          {giorno?.plannedRoute && (
            <>
              <div style={{ marginTop: "0.75rem", marginBottom: "0.6rem" }}>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Partenza: {giorno.plannedOriginText ?? "—"}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Arrivo: {giorno.plannedDestinationText ?? "—"}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Mode richiesto: {giorno.plannedRoute.modeRequested}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Mode applicato: {giorno.plannedRoute.modeApplied}
                </p>
                <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                  Distanza stimata: {giorno.plannedRoute.distanceKm.toFixed(2)} km
                </p>
                <p className="metaText" style={{ margin: 0 }}>
                  Durata stimata: {giorno.plannedRoute.durationMin.toFixed(1)} min
                </p>
              </div>
              <DayMap segments={[giorno.plannedRoute.geometry]} />
            </>
          )}

          <div style={{ borderTop: "1px solid #2A3445", marginTop: "0.9rem", paddingTop: "0.75rem" }}>
            <h3 style={{ margin: "0 0 0.45rem 0", fontSize: "1rem" }}>Google Maps directions</h3>
            {giorno?.plannedMapsUrl ? (
              <>
                <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                  Pianificazione Google Maps salvata per questo giorno.
                </p>
                <button type="button" onClick={handleOpenPlannedMap} className="buttonPrimary">
                  VAI (Google Maps)
                </button>
              </>
            ) : (
              <>
                <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                  Nessun link pianificazione impostato.
                </p>
                <button type="button" onClick={onBack} className="buttonGhost">
                  Aggiungi pianificazione
                </button>
              </>
            )}
          </div>
        </details>
        </details>

        {hotelPrenotazione && (
          <div className="card detailCard" style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.6rem 0" }}>Hotel del giorno</h2>
            <p style={{ margin: "0 0 0.25rem 0", fontWeight: 700 }}>{hotelPrenotazione.titolo}</p>
            {hotelPrenotazione.localita && (
              <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
                Localita: {hotelPrenotazione.localita}
              </p>
            )}
            {hotelPrenotazione.indirizzo && (
              <p className="metaText" style={{ margin: "0 0 0.6rem 0" }}>
                Indirizzo: {hotelPrenotazione.indirizzo}
              </p>
            )}
            <button
              type="button"
              onClick={handleOpenHotelMap}
              className="buttonGhost"
              disabled={!canOpenHotelMap}
            >
              Vai all'hotel
            </button>
          </div>
        )}

        <div className="card" style={{ padding: "0.85rem", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="buttonPrimary"
          >
            Importa GPX BMW
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx"
            onChange={(event) => void handleImport(event)}
            disabled={isImporting}
            className="hiddenInput"
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>Percorso</h2>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Trackpoints caricati: {trackPoints.length}
          </p>
          <div
            className="percorso-stat"
            style={{ fontSize: 16, fontWeight: 600, marginTop: 4, marginBottom: 8 }}
          >
            Km reali: {distanzaKmRounded} km
          </div>
          <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
            Inizio reale: {formatDateIT(firstPointTime)}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Fine reale: {formatDateIT(lastPointTime)}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.25rem 0" }}>
            Luogo inizio: {isResolvingLocations ? `${startLocation} (ricerca)` : startLocation}
          </p>
          <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
            Luogo fine: {isResolvingLocations ? `${endLocation} (ricerca)` : endLocation}
          </p>

          {gaps.length > 0 && (
            <div className="card detailCard" style={{ padding: "0.75rem", marginBottom: "0.6rem" }}>
              <p style={{ margin: "0 0 0.3rem 0", fontWeight: 700 }}>Traccia incompleta</p>
              <p className="metaText" style={{ margin: "0 0 0.5rem 0" }}>
                Rilevati gap GPS (nessun punto registrato).
              </p>
              <ul className="listPlain" style={{ marginBottom: gaps.length > 3 ? "0.45rem" : 0 }}>
                {displayedGaps.map((gap, index) => (
                  <li key={`${gap.fromTime}-${gap.toTime}-${index}`} className="metaText">
                    Gap: {formatGapDuration(gap.durationSec)} (da {formatTimeIT(gap.fromTime)} a{" "}
                    {formatTimeIT(gap.toTime)}){" "}
                    {typeof gap.approxDistanceKm === "number"
                      ? `- ~${gap.approxDistanceKm.toFixed(1)} km`
                      : ""}
                  </li>
                ))}
              </ul>
              {gaps.length > 3 && (
                <button
                  type="button"
                  className="buttonGhost"
                  onClick={() => setShowAllGaps((current) => !current)}
                >
                  {showAllGaps ? "Mostra meno" : `Mostra tutti (${gaps.length})`}
                </button>
              )}
            </div>
          )}

          <DayMap segments={segments} />
        </div>

        {isImporting && <p className="metaText">Import in corso...</p>}
        {error && <p className="errorText">{error}</p>}
        {gpxFiles.length === 0 && <p className="metaText">Nessun file GPX importato.</p>}

        {gpxFiles.length > 0 && (
          <ul className="listPlain cardsGrid">
            {gpxFiles.map((gpxFile) => (
              <li key={gpxFile.id} className="card detailCard" style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => void handleDeleteGPX(gpxFile.id)}
                  aria-label="Cancella GPX"
                  style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.5rem",
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: "1px solid #E11D48",
                    background: "rgba(225,29,72,0.15)",
                    color: "#E11D48",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.28)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "rgba(225,29,72,0.15)";
                  }}
                >
                  {"\u2715"}
                </button>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Nome file:</strong> {gpxFile.name}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Punti:</strong> {gpxFile.pointsCount}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Inizio:</strong> {formatDateIT(gpxFile.startTime)}
                </p>
                <p style={{ margin: "0 0 0.25rem 0" }}>
                  <strong>Fine:</strong> {formatDateIT(gpxFile.endTime)}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Durata min:</strong> {gpxFile.durationMin}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
