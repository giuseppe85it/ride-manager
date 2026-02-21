#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = process.cwd();

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function read(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function extractInterfaceFields(source, interfaceName) {
  const regex = new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const match = source.match(regex);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .map((line) => line.match(/^([A-Za-z0-9_?]+):\s*([^;]+);?$/))
    .filter(Boolean)
    .map((m) => `- \`${m[1]}: ${m[2].trim()}\``);
}

function extractStorageConstants(source) {
  const dbName = source.match(/const DB_NAME = "([^"]+)"/)?.[1] ?? "N/D";
  const dbVersion = source.match(/const DB_VERSION = (\d+)/)?.[1] ?? "N/D";
  const stores = Array.from(source.matchAll(/const STORE_[A-Z_]+\s*=\s*"([^"]+)"/g)).map(
    (m) => m[1]
  );
  return { dbName, dbVersion, stores };
}

function extractExportedFunctions(source) {
  const signatures = [];
  const fnRegex = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\(([^)]*)\)\s*:\s*([^{\n]+)/g;
  for (const match of source.matchAll(fnRegex)) {
    const name = match[1];
    const params = match[2].trim();
    const returns = match[3].trim().replace(/\s+/g, " ");
    signatures.push(`- \`${name}(${params}): ${returns}\``);
  }
  return signatures;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayItFormat() {
  const now = new Date();
  return `${pad(now.getDate())} ${pad(now.getMonth() + 1)} ${now.getFullYear()}`;
}

function runTypeCheckStatus() {
  try {
    execSync("npx tsc --noEmit", { cwd: repoRoot, stdio: "pipe" });
    return "OK";
  } catch {
    return "ERRORE";
  }
}

const appSource = read("src/App.tsx");
const homeSource = read("src/pages/Home.tsx");
const viaggiSource = read("src/pages/Viaggi.tsx");
const dettaglioViaggioSource = read("src/pages/DettaglioViaggio.tsx");
const giornoDettaglioSource = read("src/pages/GiornoDettaglio.tsx");
const storageSource = read("src/services/storage.ts");
const gpxServiceSource = read("src/services/gpxService.ts");
const tripStatsSource = read("src/services/tripStats.ts");
const prenotazioniSource = read("src/pages/PrenotazioniViaggio.tsx");
const prenotazioneModalSource = read("src/pages/PrenotazioneFormModal.tsx");
const geoSource = read("src/utils/geo.ts");
const segmentationSource = read("src/utils/trackSegmentation.ts");

const viaggioFields = extractInterfaceFields(read("src/models/Viaggio.ts"), "Viaggio");
const giornoFields = extractInterfaceFields(read("src/models/Giorno.ts"), "Giorno");
const gpxFileFields = extractInterfaceFields(read("src/models/GPXFile.ts"), "GPXFile");
const trackPointFields = extractInterfaceFields(read("src/models/TrackPoint.ts"), "TrackPoint");
const prenotazioneFields = extractInterfaceFields(read("src/models/Prenotazione.ts"), "Prenotazione");

const { dbName, dbVersion, stores } = extractStorageConstants(storageSource);
const storageFunctions = extractExportedFunctions(storageSource);

const hasGPXImport =
  gpxServiceSource.includes("importGPXFile") &&
  gpxServiceSource.includes("parseGPX") &&
  gpxServiceSource.includes("computeStats");
const hasTrackStorage =
  storageSource.includes("saveTrackPoints") && storageSource.includes("getTrackPointsByGiorno");
const hasMap = exists("src/components/DayMap.tsx") && giornoDettaglioSource.includes("DayMap");
const hasKm = geoSource.includes("calculateTrackDistanceKm") && giornoDettaglioSource.includes("Km reali");
const hasSegmentation =
  segmentationSource.includes("splitTrackIntoSegments") &&
  giornoDettaglioSource.includes("Traccia incompleta");
const hasPrenotazioni =
  prenotazioniSource.includes("Prenotazioni") &&
  prenotazioneModalSource.includes("savePrenotazione") &&
  dettaglioViaggioSource.includes('activeTab === "prenotazioni"');
const hasTripStats =
  tripStatsSource.includes("getTripStats") &&
  dettaglioViaggioSource.includes('activeTab === "dashboard"');
const hasViaggiMenu =
  viaggiSource.includes("viaggiMenuButton") && viaggiSource.includes("deleteViaggioCascade");

const homePlaceholders = [];
if (homeSource.includes('showComingSoon("Import GPX rapido")')) homePlaceholders.push("Import GPX rapido");
if (homeSource.includes('showComingSoon("Impostazioni")')) homePlaceholders.push("Impostazioni");
if (homeSource.includes('showComingSoon("Backup / Export")')) homePlaceholders.push("Backup / Export");

const tabs = Array.from(
  dettaglioViaggioSource.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g)
).map((m) => ({ key: m[1], label: m[2] }));
const implementedTabs = [];
if (dettaglioViaggioSource.includes('activeTab === "giorni"')) implementedTabs.push("giorni");
if (dettaglioViaggioSource.includes('activeTab === "prenotazioni"')) implementedTabs.push("prenotazioni");
if (dettaglioViaggioSource.includes('activeTab === "dashboard"')) implementedTabs.push("dashboard");
const tabPlaceholders = tabs.filter((tab) => !implementedTabs.includes(tab.key));

const typeCheckStatus = runTypeCheckStatus();
const typeCheckLine =
  typeCheckStatus === "OK"
    ? "Ultima verifica TypeScript: OK (perche gia eseguita ora)"
    : `Ultima verifica TypeScript: ${typeCheckStatus}`;

const featureDone = [];
if (hasViaggiMenu) featureDone.push("- Gestione Viaggi con CRUD, menu card (modifica/elimina/duplica) e delete cascata.");
if (hasGPXImport && hasTrackStorage)
  featureDone.push("- Import GPX BMW reale (lat/lon/ele/time) con salvataggio GPXFile e TrackPoints.");
if (hasMap) featureDone.push("- Mappa percorso giorno con rendering segmenti multipli.");
if (hasKm) featureDone.push("- Calcolo km reali del giorno da TrackPoints salvati.");
if (hasSegmentation)
  featureDone.push("- Segmentazione traccia per gap temporali + warning \"Traccia incompleta\".");
if (giornoDettaglioSource.includes("reverseGeocode"))
  featureDone.push("- Reverse geocoding inizio/fine percorso con fallback sicuro.");
if (hasTripStats) featureDone.push("- Dashboard Viaggio read-only con aggregazioni reali.");
if (hasPrenotazioni) featureDone.push("- Prenotazioni HOTEL/TRAGHETTO con filtri, ricerca e CRUD.");

const featureParziale = [];
if (homePlaceholders.length > 0) {
  featureParziale.push(`- Home: voci placeholder (${homePlaceholders.join(", ")}).`);
}
if (tabPlaceholders.length > 0) {
  featureParziale.push(
    `- Dettaglio Viaggio: tab placeholder (${tabPlaceholders.map((tab) => tab.label).join(", ")}).`
  );
}
if (storageSource.includes("getAll(") && storageSource.includes(".filter(")) {
  featureParziale.push("- Storage: varie query lato client via `getAll + filter` (non indicizzate).");
}

const todo = [];
if (tabPlaceholders.find((tab) => tab.key === "costi")) {
  todo.push("1. Implementare tab Costi con registrazione spese e aggregazioni per viaggio/giorno.");
}
if (tabPlaceholders.find((tab) => tab.key === "media")) {
  todo.push("2. Implementare tab Media per allegati del viaggio.");
}
if (homePlaceholders.includes("Backup / Export")) {
  todo.push("3. Implementare Backup/Restore JSON locale.");
}
if (homePlaceholders.includes("Import GPX rapido")) {
  todo.push("4. Implementare ingresso rapido import GPX dalla Home.");
}
if (featureParziale.some((line) => line.includes("getAll + filter"))) {
  todo.push("5. Introdurre indici/query mirate in storage per dataset grandi.");
}

const lines = [
  "# STATE_NOW - RideManager (Gestione Viaggi Moto)",
  `Data aggiornamento: ${todayItFormat()}`,
  "",
  "## Stack e vincoli",
  "- Stack: React + Vite + TypeScript, mappa Leaflet/React-Leaflet, persistenza locale IndexedDB.",
  "- Nessun backend/cloud: dati gestiti localmente nel browser.",
  "- Vincoli applicati: no dati inventati, no interpolazione punti mancanti, solo dati reali da GPX.",
  "",
  "## Data model (campi reali trovati nei model/types)",
  "### Viaggio (`src/models/Viaggio.ts`)",
  ...viaggioFields,
  "### Giorno (`src/models/Giorno.ts`)",
  ...giornoFields,
  "### GPXFile (`src/models/GPXFile.ts`)",
  ...gpxFileFields,
  "### TrackPoint (`src/models/TrackPoint.ts`)",
  ...trackPointFields,
];

if (prenotazioneFields.length > 0) {
  lines.push("### Prenotazione (`src/models/Prenotazione.ts`)", ...prenotazioneFields);
}

lines.push(
  "",
  "Relazioni:",
  "- Viaggio -> Giorni (`Giorno.viaggioId`)",
  "- Giorno -> GPXFiles (`GPXFile.giornoId`)",
  "- GPXFile -> TrackPoints (`TrackPoint.gpxFileId`)",
  "- Giorno -> TrackPoints (`TrackPoint.giornoId`)",
  "- Viaggio/Giorno -> Prenotazioni (`Prenotazione.viaggioId`, `Prenotazione.giornoId?`)",
  "",
  "## Storage/DB (IndexedDB, verificato in `src/services/storage.ts`)",
  `- DB name: \`${dbName}\``,
  `- DB version: \`${dbVersion}\``,
  `- Store: ${stores.map((store) => `\`${store}\``).join(", ")}`,
  "- Migrazione: in `onupgradeneeded` crea store mancanti; non rimuove store esistenti nella versione attuale.",
  "- Normalizzazione retrocompatibile presente: `normalizeViaggio`, `normalizeGiorno`, `normalizePrenotazione`.",
  "- Funzioni storage esportate:",
  ...storageFunctions,
  "",
  "## UI flow (pagine e navigazione reale)",
  "- Entry: `src/App.tsx` con stato vista locale (`home` -> `viaggi` -> `dettaglioViaggio` -> `giornoDettaglio`).",
  "- Home (`src/pages/Home.tsx`) -> pulsante \"Viaggi\".",
  "- Viaggi (`src/pages/Viaggi.tsx`) -> lista card viaggio + menu azioni + apertura dettaglio viaggio.",
  "- Dettaglio Viaggio (`src/pages/DettaglioViaggio.tsx`) -> tab Giorni, Prenotazioni, Dashboard (+ placeholder Costi/Media).",
  "- Giorni (`src/pages/Giorni.tsx`) -> apertura Giorno Dettaglio.",
  "- Giorno Dettaglio (`src/pages/GiornoDettaglio.tsx`) -> import GPX, mappa, km, gap warning, geocoding.",
  "",
  "## Feature FATTO / PARZIALE / TODO",
  "### FATTO",
  ...(featureDone.length > 0 ? featureDone : ["- Nessuna feature verificata."]),
  "### PARZIALE",
  ...(featureParziale.length > 0 ? featureParziale : ["- Nessuna voce parziale rilevata."]),
  "### TODO",
  ...(todo.length > 0 ? todo : ["- Nessun TODO estratto automaticamente."]),
  "",
  "## File chiave (path)",
  "- `src/App.tsx`",
  "- `src/services/storage.ts`",
  "- `src/services/gpxService.ts`",
  "- `src/services/tripStats.ts`",
  "- `src/pages/Viaggi.tsx`",
  "- `src/pages/DettaglioViaggio.tsx`",
  "- `src/pages/Giorni.tsx`",
  "- `src/pages/GiornoDettaglio.tsx`",
  "- `src/pages/PrenotazioniViaggio.tsx`",
  "- `src/pages/PrenotazioneFormModal.tsx`",
  "- `src/utils/geo.ts`",
  "- `src/utils/trackSegmentation.ts`",
  "",
  typeCheckLine,
  "Patch: aggiornamento STATE_NOW.md (autogenerato da script)",
  "",
);

fs.writeFileSync(path.join(repoRoot, "STATE_NOW.md"), lines.join("\n"), "utf8");
