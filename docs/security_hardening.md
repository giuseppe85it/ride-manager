# Security hardening report

## Cosa e' stato cambiato
1. Verificato versionamento `dist/`:
   - `git ls-files dist` -> nessun file tracciato.
   - `.gitignore` gia' contiene `dist`, quindi non sono servite modifiche aggiuntive su questo punto.
2. Spostata la configurazione Firebase su env Vite in `src/firebase/firebaseApp.ts`:
   - rimossi i valori hardcoded.
   - introdotta validazione obbligatoria con errore chiaro (`console.error` + `throw`) per variabili mancanti.
3. Creato template `.env.example` con tutte le variabili richieste Firebase.

## Come impostare `.env.local` in dev
1. Crea `./.env.local` (file locale, non da committare).
2. Copia le chiavi da `.env.example`.
3. Inserisci i valori reali Firebase:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Riavvia il dev server Vite dopo la modifica delle variabili env.

## Esito build
- Comando eseguito: `npm run build`
- Esito: OK

## Esito ricerca `AIza` nel dist
- Comando eseguito: `rg -n "AIza" dist`
- Esito: nessuna occorrenza trovata.
