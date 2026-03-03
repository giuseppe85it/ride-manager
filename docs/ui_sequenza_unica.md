# UI Sequenza Unica - RideManager

## Cosa e' cambiato
- In `src/pages/Giorni.tsx` ogni card giorno mostra ora un riassunto sequenziale in sola lettura (`SequenceSummary`) con pill in ordine.
- Regole summary in lista Giorni:
  - se esistono `dayPlan.segments`: pill per segmento (`RIDE` = `A→B` con fallback `Tratta`, `FERRY` = `Traghetto`)
  - massimo 3 pill visibili, poi pill overflow `+N`
  - se `hotelPrenotazioneId` presente: pill `Hotel`
  - fallback quando il planner non e' presente/vuoto:
    - `plannedOriginText/plannedDestinationText` -> pill `A→B`
    - altrimenti `plannedMapsUrl` -> pill `Link Maps`
- In `src/pages/GiornoDettaglio.tsx` e' stato introdotto lo switch tra due modalita:
  - `VIEW` (default): cards sequenziali pulite
  - `EDIT`: UI attuale completa di pianificazione/timeline
- In alto a `GiornoDettaglio` e' presente il toggle:
  - `Modifica` -> entra in EDIT
  - `Fine` -> torna in VIEW

## VIEW mode (nuova esperienza)
- Rendering sequenziale da `giorno.dayPlan.segments` nell'ordine attuale.
- Card `RIDE`:
  - partenza, arrivo, label sintetica
  - distanza/durata se gia calcolate
  - bottone `VAI` (navigazione Google come comportamento esistente)
- Card `FERRY`:
  - dettaglio prenotazione risolta (quando disponibile): compagnia, porti, orari
  - bottone `VAI` (navigazione verso tratta porti/search in base ai dati disponibili)
- Card hotel a fine sezione (gia presente) mantenuta con bottone `Vai all'hotel`.
- Le sezioni macchinose di pianificazione (`Pianificazione Google`, `Avanzate`, `Legacy`) sono nascoste in VIEW.

## EDIT mode (funzionalita' esistenti)
- Rimane disponibile la UI completa attuale, senza rimozioni funzionali:
  - input/link Google Maps del giorno
  - timeline RIDE/FERRY con add/remove segment
  - dropdown prenotazione traghetto
  - geocoding/route generation/preview map
  - blocco legacy
- Nessuna modifica a data model, storage o sync.

## Note fallback quando manca dayPlan
- In `GiornoDettaglio` VIEW, se non ci sono segmenti:
  - mostra sintesi da `plannedOriginText/plannedDestinationText` se presenti
  - altrimenti mostra indicazione link Google Maps se presente
  - in assenza di entrambi, messaggio guida a usare `Modifica`
