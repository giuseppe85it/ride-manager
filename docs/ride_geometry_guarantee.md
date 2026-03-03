# Ride Geometry Guarantee (exit EDIT)

## Quando viene calcolata `geometry`
- In `GiornoDettaglio`, al click su `Fine` (uscita da EDIT), il codice controlla tutti i segmenti `RIDE`.
- Per ogni `RIDE` con `geometry` assente o con meno di 2 punti, viene chiamato il calcolo route esistente (`/api/route`), lo stesso flusso usato da `Calcola tratta`.
- Se il calcolo riesce, il segmento viene aggiornato con:
  - `originText` / `destinationText` risolti
  - `modeRequested` / `modeApplied`
  - `distanceKm`, `durationMin`, `geometry`

## Comportamento se mancano dati
- UX scelta: **bloccare l'uscita da EDIT**.
- Se una tratta `RIDE` senza `geometry` non ha `Partenza` o `Arrivo`, l'app mostra errore chiaro:
  - "Completa Partenza e Arrivo delle tratte moto prima di uscire da Modifica."
- In questo caso resta in EDIT mode, cosi l'utente puo correggere subito e garantire la thumbnail in VIEW.

## Come evitare chiamate inutili
- Il controllo parte solo quando si clicca `Fine` (mai in VIEW render).
- Vengono calcolate solo le tratte `RIDE` con `geometry` mancante/invalida.
- Le tratte gia calcolate non vengono ricalcolate.
- Le richieste sono sequenziali e salvate in un unico update finale del `dayPlan`.
