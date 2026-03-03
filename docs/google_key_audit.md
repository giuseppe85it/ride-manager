# Google Key Audit (RideManager)

## Sezione 1: Dove sta la key (path + riga) e stato history

### 1.1 Presenza attuale nel codice
1. `src/firebase/firebaseApp.ts:4`
   - `apiKey: "AIzaSyD03iVYEZQ1RgPu17vyKLxEEakV8zmjfOE"`
2. `dist/assets/index-9odCyN6o.js:53`
   - La stessa key appare nel bundle buildato (atteso, perche' il config Firebase client viene incorporato nel JS finale).

### 1.2 Presenza in file ignorati/esempi/locali
1. Ricerca con `--no-ignore` (inclusi ignorati) non ha trovato altre occorrenze `AIza` oltre a:
   - `src/firebase/firebaseApp.ts`
   - `dist/assets/index-9odCyN6o.js`
2. Nessun file `.env*` trovato nel repo locale durante la scansione.
3. Nessun file `functions/` o `src/api/` presente.
4. Nei backup JSON tracciati (`RideManager_backup_2026-02-22_21-53.json`) sono presenti URL Google Maps, ma non API key `AIza`.

### 1.3 Presenza in Git history
1. Confermata presenza in history con `git grep` su tutti i commit:
   - `09f493da79aad9b0f8ada53323b57a9e2dae6d58:src/firebase/firebaseApp.ts:4`
   - `efec86a1f7b809fcba1e8862a56df752dbb3fcff:src/firebase/firebaseApp.ts:4`
2. Quindi la key non e' solo nello stato corrente: e' anche storicamente committata.

Nota: questa key e' una Firebase Web API key (Google), non una Google Maps API key dedicata.

---

## Sezione 2: Quali API Google Maps servono davvero e dove

### 2.1 Uso Google Maps rilevato nel frontend
1. `src/pages/GiornoDettaglio.tsx:121-136`
   - apertura URL `https://www.google.com/maps/dir/?api=1...`
   - uso: navigazione esterna via browser (Maps URL), non chiamata REST a Google Directions API.
2. `src/pages/GiornoDettaglio.tsx:1312`
   - apertura URL `https://www.google.com/maps/search/?api=1&query=...`
   - uso: ricerca esterna su Google Maps (Maps URL), non Geocoding API Google.

### 2.2 API Google Maps Platform (Static/Directions/Geocoding/Maps JS)
1. **Maps JavaScript API**: non rilevata.
2. **Google Static Maps API**: non rilevata.
3. **Google Directions API (REST)**: non rilevata.
4. **Google Geocoding API (REST)**: non rilevata.

### 2.3 Servizi realmente usati per mappe/geocoding
1. `src/components/DayMap.tsx:49-52`
   - map tiles OpenStreetMap via Leaflet.
2. `src/services/geocodeService.ts:83-94`
   - reverse geocoding diretto verso Nominatim (`openstreetmap.org`).
3. `server/index.js`
   - geocoding testuale: Nominatim.
   - routing: OSRM pubblico (`router.project-osrm.org`).

---

## Sezione 3: Elenco funzioni/endpoint `/api` e stato deploy/attivazione

### 3.1 Endpoint esistenti nel codice
File: `server/index.js`
1. `GET /api/geocode` (`server/index.js:311`)
   - Geocoding testuale via Nominatim.
2. `POST /api/google/parse` (`server/index.js:335`)
   - Parsing/espansione link Google Maps in punti testo.
3. `POST /api/route` (`server/index.js:363`)
   - Routing tra origine/destinazione via OSRM (+ geocode Nominatim se input testuale).
4. `POST /api/google/route` (`server/index.js:512`)
   - Parsing link Google + geocode tappe + route OSRM multi-stop.

### 3.2 Endpoint effettivamente consumati dal frontend
File: `src/pages/GiornoDettaglio.tsx`
1. `GET /api/geocode` (`:549`, `:890`)
2. `POST /api/route` (`:629`, `:983`)
3. `POST /api/google/route` (`:1246`)
4. `POST /api/google/parse`
   - **definito ma non chiamato** dal frontend corrente.

### 3.3 Runtime e attivazione (secondo config)
1. Runtime server API: Node.js + Express (ESM), avvio con `node server/index.js`.
   - riferimento: `package.json:8` (`dev:server`).
2. Porta backend: `ROUTE_SERVER_PORT` con default `5174`.
   - riferimento: `server/index.js:3`.
3. In sviluppo, Vite proxy inoltra `/api` a `http://localhost:5174`.
   - riferimento: `vite.config.ts:9-11`.

### 3.4 Cloud Functions/deploy attivo
1. Cartella `functions/`: assente.
2. `firebase.json`: hosting statico con rewrite universale a `/index.html`.
   - riferimento: `firebase.json:9-13`.
3. Non risultano Firebase Cloud Functions nel repo.
4. Non risultano config di deploy backend (`functions`, Cloud Run, workflow CI/CD) nel repo.

Conclusione operativa: secondo il codice, gli endpoint `/api/*` sono **attivi in locale/dev** se parte `dev:server`; **non risultano deployati su Firebase Hosting** con la config attuale.

---

## Sezione 4: Remediation step-by-step (key esposta su GitHub)

### 4.1 Azioni immediate (oggi)
1. Considerare la key `AIza...` compromessa (perche' committata in history pubblica).
2. Ruotare/revocare la key su Google Cloud Console (crearne una nuova).
3. Applicare restrizioni forti alla nuova key:
   - Application restriction: HTTP referrers (domini produzione + localhost dev).
   - API restrictions: solo API realmente necessarie.
4. Verificare quota/abusi recenti su key vecchia e impostare alert.

### 4.2 Rimozione dal codice sorgente
1. Spostare il config Firebase client in variabili env Vite (es. `VITE_FIREBASE_API_KEY`, ecc.).
2. Eliminare literal hardcoded da `src/firebase/firebaseApp.ts`.
3. Mantenere un file `.env.example` senza segreti reali.
4. Aggiornare `.gitignore`/prassi team per evitare commit di `.env.local` con valori reali.

Nota pratica: la Firebase Web API key lato client non puo' essere "segreta" in senso stretto; la sicurezza va fatta con restrizioni key + Security Rules + App Check.

### 4.3 Spostamento server-side (dove ha senso)
1. Per integrazioni realmente sensibili, usare endpoint server-side (`/api/*`) con secret in env server.
2. In questo repo, geocoding/routing usa Nominatim+OSRM senza key Google Maps; non serve key Google Maps lato server oggi.
3. Se in futuro si adotta Google Maps Platform REST (Directions/Geocoding/Static), fare chiamate da backend e non dal browser.

### 4.4 History rewrite (se necessario)
1. Se repository e' pubblico o condiviso esternamente: eseguire history rewrite per rimuovere la stringa key da tutti i commit.
2. Strumenti consigliati:
   - `git filter-repo` (preferibile).
   - alternativa `BFG Repo-Cleaner`.
3. Dopo rewrite:
   - force-push di tutti i branch/tag riscritti.
   - invalidare cloni locali (re-clone consigliato).
4. Anche con rewrite, trattare comunque la key vecchia come compromessa e gia' ruotata.

### 4.5 Hardening post-remediation
1. Aggiungere secret scanning in CI (es. Gitleaks/TruffleHog).
2. Aggiungere pre-commit hook locale di scansione pattern `AIza`, token, chiavi cloud.
3. Evitare build artifact locali contenenti config sensibile in cartelle condivise/pubblicate accidentalmente (`dist/`).
4. Rieseguire audit periodico su history e branch remoti.
