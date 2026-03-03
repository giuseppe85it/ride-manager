# Google Thumbnail Proxy (Ride VIEW)

## Obiettivo
- Mostrare mini-mappa Google Static nella card `RIDE` in VIEW mode.
- Non esporre la key Google al client.

## Architettura
- Frontend usa solo `<img src="/api/google/thumbnail?...">`.
- `Firebase Hosting` reindirizza `/api/**` alla Cloud Function `api`.
- La Function fa fetch server-side verso Google Static Maps e restituisce direttamente `image/png`.

## Secret richiesto
- Nome secret: `GOOGLE_MAPS_STATIC_API_KEY`

Comando:
```bash
firebase functions:secrets:set GOOGLE_MAPS_STATIC_API_KEY
```

## Deploy
```bash
firebase deploy --only functions,hosting
```

## Endpoint
- `GET /api/google/thumbnail`
- Query:
  - `w` (default 320, max 640)
  - `h` (default 180, max 360)
  - `path` (preferito): `enc:...` oppure lista `lat,lon|lat,lon|...`
  - `origin` opzionale
  - `destination` opzionale
- Risposta:
  - `200` con body immagine (`Content-Type` upstream, tipicamente `image/png`)
  - Cache header: `Cache-Control: public, max-age=86400, s-maxage=86400`
  - Errori `400` (input) / `500-502` (upstream/server)

## Note operative
- Se in VIEW un segmento RIDE ha `geometry`, il client costruisce `path` (punti campionati) e mostra thumbnail.
- Se `geometry` manca, resta fallback bottone `VAI`.
- Nessuna API key in frontend, nessuna key nei log o nelle URL client-side.
