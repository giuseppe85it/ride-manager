# Planner mappa fullscreen (Nuovo giorno)

## Come aprire il planner
- Vai in `Dettaglio viaggio` -> tab `Giorni`.
- Apri `Nuovo giorno`.
- Accanto a `Link pianificazione Google Maps` usa il bottone `Pianifica su mappa`.
- Si apre un editor fullscreen responsive:
  - Desktop: pannello waypoint a sinistra + mappa grande a destra.
  - Mobile: mappa full + pannello waypoint come sezione apribile in basso.

## Come inserire waypoint
- Click/tap sulla mappa: aggiunge un waypoint (`lat,lon`).
- Nel pannello waypoint puoi:
  - spostare un punto su/giu (riordino)
  - rimuovere un punto
- Con almeno 2 waypoint, il planner calcola automaticamente la route.

## Come viene calcolato il percorso (OSRM)
- Routing via endpoint esistente `POST /api/route`.
- Per tratte con waypoint multipli il planner calcola ogni leg consecutivo:
  - `wp1 -> wp2`
  - `wp2 -> wp3`
  - ecc.
- Le geometrie dei leg vengono unite in un'unica polyline.
- Distanza e durata finali sono la somma dei leg.
- Nessuna Google Directions API viene usata.

## Salvataggio nel giorno
Quando premi `Salva` nel planner:
- Aggiorna il form `Nuovo giorno` con:
  - `plannedMapsUrl`
  - `plannedOriginText`
  - `plannedDestinationText`
  - `plannedRoute` (engine `osrm`, geometry, distanza/durata, punti testuali)
  - `dayPlan` con segmento `RIDE` e geometry
- Alla conferma di `Salva giorno` questi campi vengono persistiti nel record `Giorno` usando il normale `saveGiorno`.

## Generazione `plannedMapsUrl` e limite waypoint
- URL base: `https://www.google.com/maps/dir/?api=1`
- Mappatura:
  - `origin` = primo waypoint
  - `destination` = ultimo waypoint
  - `waypoints` = waypoint intermedi
- Limite: massimo 20 waypoint intermedi.
- Strategia riduzione: campionamento uniforme degli intermedi (prende punti equispaziati sull'array) per restare dentro il limite.
