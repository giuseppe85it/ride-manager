# Flow diagram RideManager (analisi da codice)

## 1) Happy path numerato (dal primo avvio alla pianificazione giorno)
1. L'app monta `src/main.tsx` e avvia `AuthProvider`; viene renderizzato `App`.
2. `App` gestisce la navigazione con stato interno `view` (non React Router): `home -> viaggi -> dettaglioViaggio -> giornoDettaglio`.
3. Se l'utente non e' autenticato, viene mostrata `LoginScreen` con bottone **Accedi con Google**.
4. Dopo login:
   1. `App` esegue bootstrap cloud (`bootstrapFromCloudIfEmpty`).
   2. `App` abilita/disabilita rete Firestore in base a online/offline.
   3. `App` avvia realtime sync (`startRealtimeSync`).
5. A bootstrap completato, `view` iniziale e' `home`: schermata `Home` (non `HomeImproved`).
6. In `Home`, l'utente clicca card **Viaggi**.
7. In `Viaggi`:
   1. Clicca **Nuovo viaggio**.
   2. Compila nome, date, area, stato, note.
   3. Clicca **Salva viaggio**.
8. Sempre in `Viaggi`, clicca la card del viaggio creato per aprire `DettaglioViaggio`.
9. In `DettaglioViaggio` (tab di default = `Giorni`):
   1. Clicca **Nuovo giorno**.
   2. Compila: data, titolo, stato.
   3. (Opzionale ma rilevante) seleziona **Hotel del giorno (opzionale)** dal dropdown hotel.
   4. (Opzionale) incolla **Link pianificazione Google Maps**.
   5. Clicca **Salva giorno**.
10. In lista giorni, clicca il giorno per aprire `GiornoDettaglio`.
11. In `GiornoDettaglio`, sezione **Pianificazione (Google Maps)**:
   1. Incolla URL Google Maps giorno.
   2. Clicca **Salva link** (o blur del campo).
   3. Clicca **VAI (Google Maps)** per aprire la pianificazione esterna.
   4. (Opzionale) scegli `Direct/Curvy` e clicca **Genera mappa da Google Link** per salvare una geometria ricostruita.
12. In `GiornoDettaglio`, sezione timeline:
   1. Clicca **+ Tratta moto** per creare segmento RIDE.
   2. Compila Partenza/Arrivo (manuale o **Cerca** geocode).
   3. (Se presente hotel) usa **Usa Hotel del giorno** per precompilare arrivo.
   4. Seleziona `Direct/Curvy`.
   5. Clicca **Calcola tratta** (usa `/api/route`).
   6. Clicca **VAI** per aprire Google Maps directions su quella tratta.
13. In `GiornoDettaglio`, per traghetto:
   1. Clicca **+ Traghetto**.
   2. Nel segmento FERRY seleziona una prenotazione dal dropdown **Traghetto (prenotazione)**.
   3. (Opzionale) completa porto partenza/arrivo, compagnia, note.
14. In `GiornoDettaglio`, per hotel:
   1. Se il giorno ha `hotelPrenotazioneId`, appare card **Hotel del giorno**.
   2. Clicca **Vai all'hotel** per aprire ricerca Google Maps sull'hotel.

Nota operativa fondamentale: per usare davvero hotel/traghetto in pianificazione, le prenotazioni devono esistere prima (tab `Prenotazioni` del viaggio).

## 2) Casi alternativi numerati
1. Aprire un giorno gia' creato:
   1. Home -> Viaggi -> selezione viaggio -> tab Giorni.
   2. Click card giorno esistente -> `GiornoDettaglio`.
2. Modificare solo titolo giorno:
   1. In lista giorni cliccare menu `...` della card giorno.
   2. Click **Modifica titolo**.
   3. Salvare dal modal.
3. Eliminare giorno:
   1. In lista giorni click su icona `X` della card giorno.
   2. Conferma `window.confirm`.
4. Aggiungere hotel/traghetto mancanti prima della timeline:
   1. `DettaglioViaggio` -> tab **Prenotazioni**.
   2. Click **Nuova prenotazione**.
   3. Scegli tipo `HOTEL` o `TRAGHETTO`, compila campi specifici, salva.
   4. Torna tab **Giorni** e assegna hotel al giorno (form giorno) oppure usa prenotazione traghetto nel segmento FERRY.
5. Modificare/eliminare prenotazione:
   1. Tab `Prenotazioni` -> card prenotazione.
   2. Click **Modifica** o **Elimina**.
6. Modificare viaggio:
   1. In lista viaggi aprire menu `...` della card viaggio.
   2. Scegliere **Modifica**, **Elimina**, **Duplica viaggio**.
7. Tornare indietro:
   1. Da `GiornoDettaglio` bottone **<- Dettaglio viaggio**.
   2. Da `DettaglioViaggio` bottone **<- Viaggi**.
   3. Da `Viaggi` bottone **<- Dashboard**.
8. Pianificazione senza endpoint route disponibili:
   1. I pulsanti **Calcola tratta** / **Genera percorso** / **Genera mappa da Google Link** possono fallire con errore.
   2. Resta comunque disponibile l'apertura diretta link Google via **VAI**.
9. Recupero automatico GPX da cloud:
   1. Se ci sono GPX ma zero trackpoints locali, `GiornoDettaglio` tenta recover automatico da cloud.
10. DA VERIFICARE: comportamento produzione per endpoint `/api/*` (in repo e' certo il server locale Express; mapping deploy non visibile qui).

## 3) Schermate coinvolte (path file) + responsabilita'
1. `src/App.tsx`: orchestrazione navigazione a stato (`view`) e guard auth/bootstrap/sync.
2. `src/components/LoginScreen.tsx`: accesso con Google quando `user` assente.
3. `src/pages/Home.tsx`: dashboard iniziale reale; accesso a Viaggi, import GPX rapido, impostazioni, cloud backup/sync.
4. `src/pages/HomeImproved.tsx`: versione alternativa non usata nel routing corrente (non importata in `App` render path).
5. `src/pages/Viaggi.tsx`: CRUD viaggi, menu azioni per viaggio, apertura dettaglio viaggio.
6. `src/pages/DettaglioViaggio.tsx`: contenitore tabs del viaggio (`Giorni`, `Prenotazioni`, `Costi`, `Media`, `Dashboard`) + gestione partecipanti.
7. `src/pages/Giorni.tsx`: CRUD giorni viaggio, assegnazione hotel al giorno, link pianificazione Google del giorno, apertura giorno dettaglio.
8. `src/pages/GiornoDettaglio.tsx`: pianificazione giorno (link Google, timeline RIDE/FERRY, route calc, preview mappa, hotel panel), import/gestione GPX e percorso reale.
9. `src/pages/PrenotazioniViaggio.tsx`: elenco/filtri prenotazioni hotel-traghetto, apertura modal creazione/modifica.
10. `src/pages/PrenotazioneFormModal.tsx`: form completo prenotazione (HOTEL/TRAGHETTO) e salvataggio dati usati dal planner.
11. `server/index.js`: backend locale per `/api/geocode`, `/api/route`, `/api/google/route`.
12. `vite.config.ts`: proxy dev `/api` -> `http://localhost:5174`.

## 4) Punti macchinosi (menu/dropdown/info nascoste)
1. Azioni viaggio (modifica/elimina/duplica) nascoste dietro menu `...` nella card viaggio.
2. Azione "Gestisci partecipanti" nascosta dietro menu `...` in testata `DettaglioViaggio`.
3. Azione "Modifica titolo" giorno nascosta dietro menu `...` nella card giorno.
4. Associazione hotel al giorno disponibile solo nel form "Nuovo giorno" tramite dropdown `Hotel del giorno (opzionale)`.
5. Associazione traghetto alla timeline solo dentro singolo segmento FERRY via dropdown `Traghetto (prenotazione)`.
6. Sezione avanzata timeline/legacy in `GiornoDettaglio` e' dentro `<details>` "Avanzate (opzionale)"; parte del planner non e' subito visibile.
7. Pianificazione legacy e' annidata in un secondo `<details>`: doppio livello di espansione per vedere input route testo.
8. Informazioni traghetto dettagliate (orari/porti/errori prenotazione) emergono solo dopo scelta prenotazione nel segmento FERRY.
9. Hotel "navigabile" dipende da relazione giorno->hotel: se non associato nel giorno, in `GiornoDettaglio` non compare card hotel.
10. Per costruire un giorno completo spesso serve saltare tra tab: `Giorni` (assegnazione hotel) <-> `Prenotazioni` (creazione hotel/traghetto) <-> `GiornoDettaglio` (timeline).

## 5) Proposta tecnica breve: mini-mappa preview da URL Google

### 5.1 Cosa e' possibile in PWA senza backend
1. Salvare URL Google Maps del giorno e aprirlo con `window.open` (gia' implementato).
2. Mostrare una "preview" minimale non-geografica (es. testo origine/destinazione estratto client-side solo da URL `maps/dir/?api=1` semplice) con affidabilita' limitata.
3. Mostrare mappa OSM solo se si possiedono coordinate gia' note (ma da URL Google spesso non affidabili senza parsing robusto/espansione short link).

### 5.2 Cosa richiede API key / servizi esterni
1. Parsing robusto di link Google in tutte le varianti (short link, path complessi) + geocoding affidabile: richiede almeno servizi esterni (qui gia' Nominatim via backend).
2. Routing geometrico reale per preview mappa: richiede motore routing esterno (qui OSRM pubblico via backend).
3. Se si vuole usare API ufficiali Google Maps (embed/static map/directions avanzate), serve API key Google e relativo billing.

### 5.3 Opzione piu' semplice e robusta coi vincoli attuali
1. Mantenere l'architettura gia' presente: frontend PWA + backend leggero `server/index.js`.
2. Usare `POST /api/google/route` per:
   1. espandere/parsare URL Google;
   2. geocodificare tappe;
   3. ottenere geometria OSRM;
   4. salvare `plannedRoute` nel giorno.
3. Renderizzare preview con `DayMap` usando `plannedRoute.geometry` (gia' presente).
4. Fallback robusto: se parsing/routing fallisce, mantenere sempre attivo il bottone **VAI (Google Maps)**.
5. DA VERIFICARE: strategia di deploy del backend in produzione (senza questa parte, le API `/api/*` non sono garantite fuori dev).

---

### Verifica specifica richiesta
1. Home usata davvero: `src/pages/Home.tsx` (renderizzata in `App.tsx`).
2. `HomeImproved.tsx` presente ma non usata nel flow reale.
3. Navigazione: stato `view` in `App.tsx`, non React Router.
