# CHANGELOG

## 2026-02-22 12:20:41 - docs: note timeline planner priority over legacy planning
- Commit: 86b8e6b79a2b51c13b30eecc26d4dc7213024cdd
- Report: docs/ops-log/2026-02-22_12-20_1.md
- Files changed:
  - (no file changes)
## 2026-02-22 12:20:12 - fix: restore timeline priority in GiornoDettaglio planner
- Commit: 693f24ceabab570999f586c61d9971103ff2be75
- Report: docs/ops-log/2026-02-22_12-20.md
- Files changed:
  - src/pages/GiornoDettaglio.tsx
## 2026-02-22 12:12:32 - docs: note legacy planning hidden when timeline exists
- Commit: 810a038719c571e6a65d7f1b050f196315e28d37
- Report: docs/ops-log/2026-02-22_12-12.md
- Files changed:
  - (no file changes)
## 2026-02-22 12:11:49 - hide legacy planning when day timeline exists
- Commit: 8a56f17b7e4523cafb2677a39ff4cf02352e9dd5
- Report: docs/ops-log/2026-02-22_12-11.md
- Files changed:
  - src/pages/GiornoDettaglio.tsx
## 2026-02-22 12:02:17 - docs: note VAI button for ride segments and OsmAnd todo
- Commit: 1a74d3b45afeea1dc4341a6ae207589d8c47cae0
- Report: docs/ops-log/2026-02-22_12-02.md
- Files changed:
  - (no file changes)
## 2026-02-22 12:01:32 - feat: add VAI button for ride segments (open Google Maps directions)
- Commit: 40814b0d7d1b66f3937e14feb7749e7ab800443b
- Report: docs/ops-log/2026-02-22_12-01.md
- Files changed:
  - src/pages/GiornoDettaglio.tsx
## 2026-02-22 11:51:28 - fix: prevent /api/route 400 for ride to hotel and show clear errors
- Commit: e88c4f97ac85d442062b2f5174e3966fce551c82
- Report: docs/ops-log/2026-02-22_11-51.md
- Files changed:
  - src/pages/GiornoDettaglio.tsx
## 2026-02-22 11:40:35 - docs: update STATE_NOW for simplified day planner
- Commit: fa6a6ff1dd37ce468ae3f9d9d83660d51c631f33
- Report: docs/ops-log/2026-02-22_11-40.md
- Files changed:
  - (no file changes)
## 2026-02-22 11:39:29 - Simplify day planner and bind ferry segments to bookings
- Commit: fce43c87e3ba7c1ebb8ca80c083034dbdeaae301
- Report: docs/ops-log/2026-02-22_11-39.md
- Files changed:
  - STATE_NOW.md
  - src/models/Giorno.ts
  - src/pages/GiornoDettaglio.tsx
  - src/services/storage.ts
## 2026-02-22 11:24:35 - fix: resolve JSX parse error in GiornoDettaglio time range
- Commit: d6d6e38e4f52492326e305f30e73e7fe3fe7bdc4
- Report: docs/ops-log/2026-02-22_11-24.md
- Files changed:
  - src/pages/GiornoDettaglio.tsx
## 2026-02-22 11:13:21 - Add day timeline planner with ride ferry segments
- Commit: 223b8d07f9ec04706fe688766f17f068707476f4
- Report: docs/ops-log/2026-02-22_11-13.md
- Files changed:
  - STATE_NOW.md
  - src/models/Giorno.ts
  - src/pages/GiornoDettaglio.tsx
  - src/services/storage.ts
## 2026-02-22 10:41:39 - Add text-based route planning geocoding flow
- Commit: ff347992d8ab1c66380bc8d3c7ba89408098c3d7
- Report: docs/ops-log/2026-02-22_10-41.md
- Files changed:
  - STATE_NOW.md
  - server/index.js
  - src/models/Giorno.ts
  - src/pages/GiornoDettaglio.tsx
  - src/services/storage.ts
## 2026-02-21 22:08:11 - Add local OSRM planned routing backend and Giorno preview
- Commit: 8c061f4798d1cb7f06a2e53ce1f1ec31517baf39
- Report: docs/ops-log/2026-02-21_22-08.md
- Files changed:
  - STATE_NOW.md
  - package.json
  - server/index.js
  - src/models/Giorno.ts
  - src/pages/GiornoDettaglio.tsx
  - src/services/storage.ts
  - vite.config.ts
## 2026-02-21 21:39:59 - Add Google Maps planning link support for Giorno
- Commit: cdb7e637072ea8a7267f44c16ede46843410895e
- Report: docs/ops-log/2026-02-21_21-39.md
- Files changed:
  - STATE_NOW.md
  - src/models/Giorno.ts
  - src/pages/Giorni.tsx
  - src/pages/GiornoDettaglio.tsx
  - src/services/storage.ts
## 2026-02-21 20:44:57 - fix: semplifica quick add benzina con prezzo litro calcolato
- Commit: d59f59ac8536f358bc8c8b4d2ffcc725af07efef
- Report: docs/ops-log/2026-02-21_20-44.md
- Files changed:
  - src/pages/CostoFormModal.tsx
## 2026-02-21 20:39:38 - feat: aggiunge quick add benzina/pedaggi e categoria pedaggi
- Commit: 4cf6755a955e5409e3685a9e4d8c8860d76bbe3e
- Report: docs/ops-log/2026-02-21_20-39.md
- Files changed:
  - src/models/Costo.ts
  - src/pages/CostiViaggio.tsx
  - src/pages/CostoFormModal.tsx
  - src/services/storage.ts
## 2026-02-21 19:19:25 - feat: aggiunge impostazioni partecipanti e label payer dinamiche
- Commit: 9487967921222633a75275248186beb7de338066
- Report: docs/ops-log/2026-02-21_19-19.md
- Files changed:
  - STATE_NOW.md
  - src/models/ImpostazioniApp.ts
  - src/pages/CostiViaggio.tsx
  - src/pages/CostoFormModal.tsx
  - src/pages/Home.tsx
  - src/pages/ImpostazioniModal.tsx
  - src/pages/PrenotazioneFormModal.tsx
  - src/services/storage.ts
## 2026-02-21 18:41:43 - feat: migliora costi con payer prenotazioni e breakdown per categoria
- Commit: 9517f6eab4cde6719320e5ed43c5f9648e913358
- Report: docs/ops-log/2026-02-21_18-41.md
- Files changed:
  - STATE_NOW.md
  - src/models/Prenotazione.ts
  - src/pages/CostiViaggio.tsx
  - src/pages/PrenotazioneFormModal.tsx
  - src/services/storage.ts
## 2026-02-21 18:27:00 - feat: integra prenotazioni nel tab costi con totali separati
- Commit: 791700071f9262a9ef7a6d30e4df0fd841573961
- Report: docs/ops-log/2026-02-21_18-27.md
- Files changed:
  - STATE_NOW.md
  - src/pages/CostiViaggio.tsx
## 2026-02-21 18:11:05 - docs: automatizza aggiornamento STATE_NOW su commit
- Commit: 365f010bd6c1e411f8575bba65bae23a4c592a2d
- Report: docs/ops-log/2026-02-21_18-11.md
- Files changed:
  - .githooks/post-commit
  - .githooks/pre-commit
  - README.md
  - STATE_NOW.md
  - scripts/generateOpsLog.cjs
  - scripts/generateStateNow.cjs
## 2026-02-21 18:00:03 - docs: aggiorna STATE_NOW con stato operativo verificato
- Commit: e70dccc230111e097a1682ce4aebae28918bb9e1
- Report: docs/ops-log/2026-02-21_18-00.md
- Files changed:
  - STATE_NOW.md
## 2026-02-20 16:56:27 - aggiornamento
- Commit: 9ede08d248be6ea688645ef354a0330887e227ba
- Report: docs/ops-log/2026-02-20_16-56.md
- Files changed:
  - CHANGELOG.md
  - STATE_NOW.md
  - docs/ops-log/2026-02-19_22-23_1.md
  - ops.log
  - src/models/Prenotazione.ts
  - src/pages/DettaglioViaggio.tsx
  - src/pages/GiornoDettaglio.tsx
  - src/pages/PrenotazioneFormModal.tsx
  - src/pages/PrenotazioniViaggio.css
  - src/pages/PrenotazioniViaggio.tsx
  - src/pages/Viaggi.css
  - src/pages/Viaggi.tsx
  - src/services/storage.ts
  - src/services/tripStats.ts
  - src/utils/trackSegmentation.ts
## 2026-02-19 22:23:32 - AGGIORNAMENTO 1.0
- Commit: 41afad9d3ff2c4ee1cfacce81b56cae7cc6dd91f
- Report: docs/ops-log/2026-02-19_22-23_1.md
- Files changed:
  - CHANGELOG.md
  - STATE_NOW.md
  - docs/ops-log/2026-02-19_22-23.md
  - ops.log
## 2026-02-19 22:23:28 - aggiornamento
- Commit: e310e076131254cccdbe48ba2a2ea66e4f6f480d
- Report: docs/ops-log/2026-02-19_22-23.md
- Files changed:
  - CHANGELOG.md
  - STATE_NOW.md
  - docs/ops-log/2026-02-19_19-09.md
  - ops.log
  - src/App.tsx
  - src/components/DayMap.tsx
  - src/models/GPXFile.ts
  - src/models/Giorno.ts
  - src/models/TrackPoint.ts
  - src/models/Viaggio.ts
  - src/pages/DettaglioViaggio.tsx
  - src/pages/Giorni.tsx
  - src/pages/GiornoDettaglio.tsx
  - src/pages/Home.css
  - src/pages/Home.tsx
  - src/pages/TestImportGPX.tsx
  - src/pages/Viaggi.tsx
  - src/services/geocodeService.ts
  - src/services/gpxService.ts
  - src/services/storage.ts
  - src/styles/layout.css
  - src/styles/theme.css
  - src/utils/geo.ts
## 2026-02-19 19:09:48 - test tracking
- Commit: 2841579406593e5ca25bcfe24e8527fc143e50c0
- Report: docs/ops-log/2026-02-19_19-09.md
- Files changed:
  - .gitignore
  - CHANGELOG.md
  - README.md
  - STATE_NOW.md
  - docs/ops-log/2026-02-19_19-04.md
  - docs/ops-log/2026-02-19_19-05.md
  - eslint.config.js
  - index.html
  - ops.log
  - package-lock.json
  - package.json
  - public/vite.svg
  - src/App.css
  - src/App.tsx
  - src/assets/react.svg
  - src/index.css
  - src/main.tsx
  - src/models/GPXFile.ts
  - src/models/Giorno.ts
  - src/models/Viaggio.ts
  - src/navigation/providers/organicMaps.ts
  - src/navigation/providers/providerBase.ts
  - src/services/gpxService.ts
  - src/services/navigationService.ts
  - src/services/storage.ts
  - tsconfig.app.json
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts
## 2026-02-19 19:05:20 - test: verify ops hook
- Commit: ff6c001faecc119c4152708a43ecd56228441cc8
- Report: docs/ops-log/2026-02-19_19-05.md
- Files changed:
  - (no file changes)
## 2026-02-19 19:04:59 - chore: install automatic ops tracking
- Commit: bfa8db751df9b825c6219fdc87d4094b53a6712b
- Report: docs/ops-log/2026-02-19_19-04.md
- Files changed:
  - .githooks/post-commit
  - CHANGELOG.md
  - STATE_NOW.md
  - ops.log
  - scripts/generateOpsLog.cjs
