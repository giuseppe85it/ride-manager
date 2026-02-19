import { useState } from "react";
import type { ChangeEvent } from "react";
import type { GPXFile } from "../models/GPXFile";
import { importGPXFile } from "../services/gpxService";

export default function TestImportGPX() {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GPXFile | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const imported = await importGPXFile(file);
      setResult(imported);
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : "Errore durante l'import GPX";
      setError(message);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  return (
    <main style={{ padding: "1rem", maxWidth: 640 }}>
      <h1>Test Import GPX</h1>

      <label htmlFor="gpx-file-input">Seleziona file GPX</label>
      <input
        id="gpx-file-input"
        type="file"
        accept=".gpx"
        onChange={handleFileChange}
        disabled={isImporting}
        style={{ display: "block", marginTop: "0.5rem", marginBottom: "1rem" }}
      />

      {isImporting && <p>Import in corso...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <section>
          <h2>Risultato import</h2>
          <p>Nome file: {result.name}</p>
          <p>Points count: {result.pointsCount}</p>
          <p>Start time: {result.startTime}</p>
          <p>End time: {result.endTime}</p>
          <p>Duration min: {result.durationMin}</p>
        </section>
      )}
    </main>
  );
}
