# Ride Geometry Guarantee (VIEW auto-generate, no edit blocks)

## Prima vs ora
- Prima: il calcolo geometry avveniva su `Fine` in EDIT e poteva bloccare l'uscita.
- Ora: `Fine` **non blocca mai**. L'uscita da EDIT e' sempre immediata.
- La geometry mancante viene generata in VIEW con `useEffect` controllato.

## Quando viene calcolata `geometry`
- In VIEW mode (`!isEditMode`), un effetto cerca segmenti `RIDE` con:
  - `geometry` assente/invalida
  - `originText` e `destinationText` valorizzati
- Per i segmenti idonei usa la logica esistente di calcolo route (`/api/route`), la stessa di `Calcola tratta`.
- Quando il calcolo riesce, il segmento viene aggiornato con:
  - `originText` / `destinationText` risolti
  - `modeRequested` / `modeApplied`
  - `distanceKm`, `durationMin`, `geometry`

## Cosa succede se mancano dati
- Se un `RIDE` non ha `origin/destination`, in VIEW non parte nessuna chiamata.
- La card mostra placeholder con testo `Completa dati in Modifica`.
- Click sulla mini-area senza geometry apre EDIT mode.
- Al click su `Fine`, se esistono tratte senza dati viene mostrato warning non bloccante.

## Anti-loop e chiamate inutili
- Nessuna chiamata API in render.
- Effetto VIEW con massimo 1 calcolo in corso (sequenziale).
- `inFlightSegmentIds` evita duplicati concorrenti.
- `triedSegmentIds` garantisce tentativo una sola volta per segmento nella sessione corrente.
- Segmenti gia' con geometry non vengono ricalcolati.
