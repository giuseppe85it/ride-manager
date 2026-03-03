# RideManager - Data model Giorno e mappa UI (analisi da codice)

## 1) Data model del Giorno

### 1.1 Dove e' definito
- `src/models/Giorno.ts`
  - `PlannedRoutePoint` (lat/lon)
  - `PlannedRoute`
  - `RideSegment` (`type: "RIDE"`)
  - `FerrySegment` (`type: "FERRY"`)
  - `DayPlan` (`segments[]`, `boardingBufferMin`, timestamp)
  - `Giorno`
- Modello prenotazioni correlato: `src/models/Prenotazione.ts`
  - `PrenotazioneTipo = "HOTEL" | "TRAGHETTO"`
  - `Prenotazione` contiene campi usati da hotel/traghetto in UI giorno.

### 1.2 Struttura reale (persistita e normalizzata)
- Forma principale del giorno (`src/models/Giorno.ts`):
  - `id`, `viaggioId`, `data`, `titolo`, `stato`, `createdAt`
  - opzionali: `note`, `hotelPrenotazioneId`, `plannedMapsUrl`, `plannedOriginText`, `plannedDestinationText`, `plannedRoute`, `dayPlan`
- Planner del giorno:
  - `dayPlan.segments` e' un array eterogeneo (union) di elementi `RIDE` o `FERRY`.
  - `RIDE`: campi testo partenza/arrivo + mode + opzionali distanza/durata/geometry.
  - `FERRY`: riferimento opzionale a prenotazione (`prenotazioneId`) + campi opzionali porto/compagnia/note.
- Normalizzazione in storage (`src/services/storage.ts`):
  - `normalizeGiorno()` normalizza campi opzionali e `dayPlan`.
  - `normalizeDayPlanSegment()` accetta solo segmenti validi `RIDE`/`FERRY`; scarta altro.
  - `normalizeDayPlan()` imposta default `boardingBufferMin=45` se mancante/non valido.

### 1.3 Esempi oggetto (derivati da codice, senza dati sensibili)
- Giorno minimale creato da form Giorni (`src/pages/Giorni.tsx`, `nuovoGiorno`):
```json
{
  "id": "giorno_xxx",
  "viaggioId": "viaggio_xxx",
  "data": "2026-03-03",
  "titolo": "",
  "stato": "PIANIFICATO",
  "hotelPrenotazioneId": "pren_xxx",
  "plannedMapsUrl": "https://maps.google.com/...",
  "createdAt": "2026-03-03T10:00:00.000Z"
}
```
- Giorno auto-creato da import GPX (`src/services/gpxService.ts`, `buildNewAutoDay`):
```json
{
  "id": "giorno_xxx",
  "viaggioId": "viaggio_xxx",
  "data": "2026-03-03",
  "titolo": "GIRO BMW",
  "stato": "FATTO",
  "createdAt": "2026-03-03T10:00:00.000Z"
}
```
- DayPlan con sequenza mista RIDE/FERRY (shape reale da model + handlers `handleAddRideSegment` / `handleAddFerrySegment`):
```json
{
  "dayPlan": {
    "segments": [
      {
        "id": "ride_xxx",
        "type": "RIDE",
        "originText": "Punto A",
        "destinationText": "Punto B",
        "modeRequested": "direct"
      },
      {
        "id": "ferry_xxx",
        "type": "FERRY",
        "prenotazioneId": "pren_traghetto_xxx",
        "departPortText": "Porto A",
        "arrivePortText": "Porto B"
      }
    ],
    "boardingBufferMin": 45,
    "createdAt": "2026-03-03T10:00:00.000Z",
    "updatedAt": "2026-03-03T10:10:00.000Z"
  }
}
```

### 1.4 Dove si salva (storage)
- Primario: IndexedDB store `giorni` (`src/services/storage.ts`):
  - `initDB()` crea object store `giorni`.
  - `saveGiorno()` scrive su IndexedDB.
  - `getGiorno()` / `getGiorniByViaggio()` leggono da IndexedDB.
- Mirror cloud (se utente autenticato):
  - `saveGiorno()` fa mirror su collection cloud `giorni` e `giorni_index` via `cloudSync`.
  - Realtime cloud (`src/services/cloudRealtime.ts`) riallinea locale usando `saveGiorno(..., { skipCloud: true })`.

## 2) Flusso UI (Giorno) e origine dropdown/menu

### 2.1 Navigazione reale fino al Giorno
1. Entry: `src/main.tsx` renderizza `<App />` dentro `AuthProvider`.
2. `src/App.tsx` NON usa React Router: navigazione a stato `view` (`home | viaggi | dettaglioViaggio | giornoDettaglio`).
3. Da `dettaglioViaggio`, `onOpenGiorno(giornoId)` imposta `view.page = "giornoDettaglio"`.
4. `src/pages/DettaglioViaggio.tsx` mostra tab; nel tab `giorni` renderizza `<Giorni ... />`.
5. `src/pages/Giorni.tsx`: click card giorno (`onOpenGiorno`) apre `GiornoDettaglio`.

### 2.2 Componenti che mostrano/gestiscono dati Giorno
- `src/pages/Giorni.tsx`
  - Form creazione giorno (data/titolo/stato/hotel/link Google).
  - Lista card giorno + badge stato + eventuale hotel collegato.
  - Menu azioni per-card (tre puntini) e delete.
- `src/pages/GiornoDettaglio.tsx`
  - Carica giorno + hotel + prenotazioni traghetto + GPX/trackpoints.
  - Sezione "Pianificazione (Google Maps)" (input URL, salva, VAI, genera mappa da link).
  - Sezione timeline RIDE/FERRY dentro `details` "Avanzate (opzionale)".
  - Sezione `details` "Pianificazione legacy (opzionale)".
  - Card "Hotel del giorno" (se presente).

### 2.3 Dove nasce il dropdown/menu "macchinoso"
- Menu card giorno (tre puntini) in `Giorni.tsx`:
  - Azioni in menu contestuale (`menuOpenForDayId`), ad oggi: "Modifica titolo".
- Dropdown hotel nel form nuovo giorno in `Giorni.tsx`:
  - `select` "Hotel del giorno (opzionale)".
- Dropdown traghetto nel planner timeline in `GiornoDettaglio.tsx`:
  - `select` "Traghetto (prenotazione)" per segmento `FERRY`.
- Ulteriore frizione UI:
  - Timeline principale e dentro `details` "Avanzate (opzionale)": l'utente deve espandere per vedere/modificare tratte/traghetti.

### 2.4 Azioni disponibili oggi (da codice)
- In `Giorni.tsx`:
  - `add`: Nuovo giorno + Salva.
  - `view`: Apri dettaglio giorno.
  - `edit`: Modifica titolo (via menu e modale).
  - `delete`: Cancella giorno (+ delete dati collegati GPX/trackpoint).
- In `GiornoDettaglio.tsx`:
  - Link Google giorno: incolla/salva/apri (`VAI`), genera mappa da link (`/api/google/route`).
  - Timeline: aggiungi `RIDE`, aggiungi `FERRY`, aggiungi tratta verso porto, modifica campi, cerca geocode (`/api/geocode`), calcola tratta (`/api/route`), apri navigazione Google (`VAI`), rimuovi segmento.
  - Hotel giorno: visualizza card e bottone "Vai all'hotel".

## 3) Punto migliore per implementare "sequenza unica"

### 3.1 Componente consigliato
- `src/pages/GiornoDettaglio.tsx` (sezione timeline) e' il punto piu diretto.

### 3.2 Perche'
- Qui sono gia disponibili tutti i dati necessari, nello stesso scope:
  - `giorno.dayPlan.segments` (ordine reale della sequenza)
  - `ferryPrenotazioniById` (risoluzione dettagli traghetto)
  - `hotelPrenotazione` (dati hotel del giorno)
  - `dayPlanRideSegmentsForMap` (preview map tratte RIDE)
- La UI gia itera in ordine su `dayPlan.segments.map(...)`: base naturale per cards sequenziali unificate.

### 3.3 DA VERIFICARE
- Se "sequenza unica" deve essere visibile anche nella lista `Giorni` (overview) o solo nel dettaglio giorno.
- Se il blocco "Pianificazione legacy" deve restare esposto o essere sostituito quando esiste la sequenza unica.
- In `src/pages/GiornoDettaglio.tsx` compaiono due chiusure `</details>` consecutive in coda alla sezione planner: verificare in UI se e' voluto o refuso.

## 4) Elenco file coinvolti (path + ruolo)

- `src/main.tsx` - entrypoint React, monta `App`.
- `src/App.tsx` - navigazione app a stato (`view`), senza React Router; instrada verso Giorni/GiornoDettaglio.
- `src/models/Giorno.ts` - definizione type/interface del Giorno e planner (`DayPlan`, segmenti RIDE/FERRY).
- `src/models/Prenotazione.ts` - definizione prenotazioni HOTEL/TRAGHETTO usate dai riferimenti nel Giorno.
- `src/pages/DettaglioViaggio.tsx` - tab container del viaggio; renderizza tab `giorni`.
- `src/pages/Giorni.tsx` - creazione/lista giorni, menu azioni card, selezione hotel, apertura dettaglio giorno.
- `src/pages/GiornoDettaglio.tsx` - rendering e update completo del giorno: link Google, timeline segmenti, dropdown traghetto, card hotel.
- `src/pages/PrenotazioniViaggio.tsx` - elenco prenotazioni del viaggio (fonte opzioni HOTEL/TRAGHETTO lato dominio).
- `src/pages/PrenotazioneFormModal.tsx` - creazione/modifica prenotazioni che alimentano i dropdown in Giorno.
- `src/services/storage.ts` - persistenza IndexedDB (`giorni`) + normalizzazione + mirror cloud.
- `src/services/cloudSync.ts` - upsert/delete su Firestore con outbox.
- `src/services/cloudRealtime.ts` - sync realtime cloud->locale su collection `giorni`.
- `src/services/gpxService.ts` - auto-creazione giorno da import GPX (`buildNewAutoDay`) e salvataggio associato.
