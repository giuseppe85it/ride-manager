# STATE_NOW - RideManager (Gestione Viaggi Moto)
Data aggiornamento: 03 03 2026

## Stack e vincoli
- Stack: React + Vite + TypeScript, mappa Leaflet/React-Leaflet, persistenza locale IndexedDB.
- Nessun backend/cloud: dati gestiti localmente nel browser.
- Vincoli applicati: no dati inventati, no interpolazione punti mancanti, solo dati reali da GPX.

## Data model (campi reali trovati nei model/types)
### Viaggio (`src/models/Viaggio.ts`)
- `id: string`
- `nome: string`
- `dataInizio: string`
- `dataFine: string`
- `area: string`
- `partecipanti?: string[]`
- `valuta: "EUR"`
- `stato: "PIANIFICAZIONE" | "ATTIVO" | "CONCLUSO" | "ARCHIVIATO"`
- `note?: string`
- `createdAt: string`
### Giorno (`src/models/Giorno.ts`)
- `id: string`
- `viaggioId: string`
- `data: string`
- `titolo: string`
- `stato: "PIANIFICATO" | "IN_CORSO" | "FATTO"`
- `note?: string`
- `hotelPrenotazioneId?: string`
- `plannedMapsUrl?: string`
- `plannedOriginText?: string`
- `plannedDestinationText?: string`
- `plannedRoute?: PlannedRoute`
- `dayPlan?: DayPlan`
- `createdAt: string`
### GPXFile (`src/models/GPXFile.ts`)
- `id: string`
- `viaggioId?: string`
- `giornoId: string`
- `kind: "planned" | "actual"`
- `name: string`
- `filename?: string`
- `uri: string`
- `source: "bmw" | "BMW" | "manual"`
- `startTime: string`
- `endTime: string`
- `durationMin: number`
- `pointsCount: number`
- `storagePath?: string`
- `downloadUrl?: string`
- `rawSizeBytes?: number`
- `createdAt: string`
- `updatedAt?: string`
- `_clientId?: string`
### TrackPoint (`src/models/TrackPoint.ts`)
- `id?: number`
- `gpxFileId: string`
- `giornoId: string`
- `pointIndex: number`
- `lat: number`
- `lon: number`
- `time: string`
- `elevation: number`
### Prenotazione (`src/models/Prenotazione.ts`)
- `id: string`
- `viaggioId: string`
- `giornoId?: string`
- `tipo: PrenotazioneTipo`
- `stato: PrenotazioneStato`
- `titolo: string`
- `fornitore?: string`
- `localita?: string`
- `dataInizio: string`
- `dataFine?: string`
- `oraInizio?: string`
- `oraFine?: string`
- `indirizzo?: string`
- `checkIn?: string`
- `checkOut?: string`
- `ospiti?: number`
- `camere?: number`
- `parcheggioMoto?: boolean`
- `colazioneInclusa?: boolean`
- `portoPartenza?: string`
- `portoArrivo?: string`
- `compagnia?: string`
- `nave?: string`
- `cabina?: string`
- `veicolo?: "MOTO" | "AUTO" | "ALTRO"`
- `targaVeicolo?: string`
- `passeggeri?: number`
- `numeroPrenotazione?: string`
- `url?: string`
- `email?: string`
- `telefono?: string`
- `valuta: "EUR"`
- `costoTotale?: number`
- `caparra?: number`
- `pagato?: boolean`
- `pagatoDa?: "IO" | "LEI" | "DIVISO"`
- `quotaIo?: number`
- `quotaLei?: number`
- `note?: string`
- `createdAt: string`
- `updatedAt: string`

Relazioni:
- Viaggio -> Giorni (`Giorno.viaggioId`)
- Giorno -> GPXFiles (`GPXFile.giornoId`)
- GPXFile -> TrackPoints (`TrackPoint.gpxFileId`)
- Giorno -> TrackPoints (`TrackPoint.giornoId`)
- Viaggio/Giorno -> Prenotazioni (`Prenotazione.viaggioId`, `Prenotazione.giornoId?`)

## Storage/DB (IndexedDB, verificato in `src/services/storage.ts`)
- DB name: `RideManagerDB`
- DB version: `8`
- Store: `viaggi`, `giorni`, `gpxFiles`, `trackPoints`, `prenotazioni`, `costi`, `impostazioni`, `outbox`
- Migrazione: in `onupgradeneeded` crea store mancanti; non rimuove store esistenti nella versione attuale.
- Normalizzazione retrocompatibile presente: `normalizeViaggio`, `normalizeGiorno`, `normalizePrenotazione`.
- Funzioni storage esportate:
- `initDB(): Promise<IDBDatabase>`
- `enqueueOutbox(op: OutboxOp,
  collection: CloudSyncCollectionName,
  docId: string,
  payload?: unknown,): Promise<OutboxRecord>`
- `listOutbox(): Promise<OutboxRecord[]>`
- `hasPendingOutboxEntry(collection: CloudSyncCollectionName,
  docId: string,): Promise<boolean>`
- `removeOutbox(id: string): Promise<void>`
- `saveViaggio(viaggio: Viaggio, opts?: CloudMirrorOptions): Promise<void>`
- `getViaggi(): Promise<Viaggio[]>`
- `getViaggiRecordCount(): Promise<number>`
- `getCloudSyncRecordRaw(collection: RealtimeDataCollectionName,
  docId: string,): Promise<Record<string, unknown> | undefined>`
- `getViaggioById(viaggioId: string): Promise<Viaggio | undefined>`
- `saveGiorno(giorno: Giorno, opts?: CloudMirrorOptions): Promise<void>`
- `getGiorniByViaggio(viaggioId: string): Promise<Giorno[]>`
- `getGiorno(giornoId: string): Promise<Giorno | undefined>`
- `saveGPXFile(gpxFile: GPXFile, _opts?: CloudMirrorOptions): Promise<void>`
- `getGPXFilesByGiorno(giornoId: string): Promise<GPXFile[]>`
- `deleteGPXFile(gpxFileId: string, _opts?: CloudMirrorOptions): Promise<void>`
- `saveTrackPoints(trackPoints: TrackPoint[]): Promise<void>`
- `getTrackPoints(): Promise<TrackPoint[]>`
- `getTrackPointsByGiorno(giornoId: string): Promise<TrackPoint[]>`
- `deleteTrackPointsByGpxFileId(gpxFileId: string): Promise<void>`
- `deleteTrackPointsByGiornoId(giornoId: string): Promise<void>`
- `deleteGpxFilesByGiornoId(giornoId: string): Promise<void>`
- `deleteGiorno(giornoId: string, opts?: CloudMirrorOptions): Promise<void>`
- `savePrenotazione(prenotazione: Prenotazione,
  opts?: CloudMirrorOptions,): Promise<void>`
- `getPrenotazioniByViaggio(viaggioId: string): Promise<Prenotazione[]>`
- `getPrenotazioniByGiorno(giornoId: string): Promise<Prenotazione[]>`
- `getPrenotazione(id: string): Promise<Prenotazione | undefined>`
- `deletePrenotazione(id: string, opts?: CloudMirrorOptions): Promise<void>`
- `saveCosto(costo: Costo, opts?: CloudMirrorOptions): Promise<void>`
- `getCostiByViaggio(viaggioId: string): Promise<Costo[]>`
- `getCostiByGiorno(giornoId: string): Promise<Costo[]>`
- `getCosto(id: string): Promise<Costo | undefined>`
- `deleteCosto(id: string, opts?: CloudMirrorOptions): Promise<void>`
- `getImpostazioniApp(): Promise<ImpostazioniApp | undefined>`
- `saveImpostazioniApp(data: ImpostazioniApp): Promise<void>`
- `exportBackupJSON(): Promise<BackupPayload>`
- `restoreFromBackupJSON(payload: BackupPayload): Promise<void>`
- `deleteViaggioCascade(viaggioId: string,
  opts?: CloudMirrorOptions,): Promise<void>`

## UI flow (pagine e navigazione reale)
- Entry: `src/App.tsx` con stato vista locale (`home` -> `viaggi` -> `dettaglioViaggio` -> `giornoDettaglio`).
- Home (`src/pages/Home.tsx`) -> pulsante "Viaggi".
- Viaggi (`src/pages/Viaggi.tsx`) -> lista card viaggio + menu azioni + apertura dettaglio viaggio.
- Dettaglio Viaggio (`src/pages/DettaglioViaggio.tsx`) -> tab Giorni, Prenotazioni, Dashboard (+ placeholder Costi/Media).
- Giorni (`src/pages/Giorni.tsx`) -> apertura Giorno Dettaglio.
- Giorno Dettaglio (`src/pages/GiornoDettaglio.tsx`) -> import GPX, mappa, km, gap warning, geocoding.

## Feature FATTO / PARZIALE / TODO
### FATTO
- Gestione Viaggi con CRUD, menu card (modifica/elimina/duplica) e delete cascata.
- Import GPX BMW reale (lat/lon/ele/time) con salvataggio GPXFile e TrackPoints.
- Mappa percorso giorno con rendering segmenti multipli.
- Calcolo km reali del giorno da TrackPoints salvati.
- Segmentazione traccia per gap temporali + warning "Traccia incompleta".
- Reverse geocoding inizio/fine percorso con fallback sicuro.
- Dashboard Viaggio read-only con aggregazioni reali.
- Prenotazioni HOTEL/TRAGHETTO con filtri, ricerca e CRUD.
### PARZIALE
- Dettaglio Viaggio: tab placeholder (Costi, Media).
- Storage: varie query lato client via `getAll + filter` (non indicizzate).
### TODO
1. Implementare tab Costi con registrazione spese e aggregazioni per viaggio/giorno.
2. Implementare tab Media per allegati del viaggio.
5. Introdurre indici/query mirate in storage per dataset grandi.

## File chiave (path)
- `src/App.tsx`
- `src/services/storage.ts`
- `src/services/gpxService.ts`
- `src/services/tripStats.ts`
- `src/pages/Viaggi.tsx`
- `src/pages/DettaglioViaggio.tsx`
- `src/pages/Giorni.tsx`
- `src/pages/GiornoDettaglio.tsx`
- `src/pages/PrenotazioniViaggio.tsx`
- `src/pages/PrenotazioneFormModal.tsx`
- `src/utils/geo.ts`
- `src/utils/trackSegmentation.ts`

Ultima verifica TypeScript: OK (perche gia eseguita ora)
Patch: aggiornamento STATE_NOW.md (autogenerato da script)
