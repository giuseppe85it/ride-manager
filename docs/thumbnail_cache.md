# Cache mini-mappa RIDE

## Quando viene generata
- La mini-mappa RIDE viene generata solo in uscita da `Modifica` (click su `Fine`) in `GiornoDettaglio`.
- In quel flusso, per ogni segmento `RIDE`:
  - se manca `geometry` ma sono presenti `originText` e `destinationText`, viene prima calcolata la route (`/api/route`);
  - se `geometry` e valida, viene generata la thumbnail (`/api/google/thumbnail`) e salvata nel segmento.

## Quando viene rigenerata
- Viene calcolato un hash stabile della `geometry` (campionata + lunghezza totale).
- La thumbnail viene rigenerata solo se:
  - `thumbnailDataUrl` manca, oppure
  - `thumbnailHash` e diverso dall'hash corrente della geometry.

## Dove viene salvata
- Nel segmento `RIDE` (`dayPlan.segments`) con campi opzionali:
  - `thumbnailDataUrl?: string`
  - `thumbnailHash?: string`
- I campi sono persistiti nello storage tramite la normalizzazione di `storage.ts`.

## Comportamento in VIEW
- In VIEW non vengono fatte fetch per la mini-mappa.
- La card RIDE usa solo `segment.thumbnailDataUrl` se presente.
- Se manca la thumbnail, viene mostrato un placeholder statico (nessuna chiamata live).
