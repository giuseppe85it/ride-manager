import { useState } from "react";
import { flushOutbox } from "../services/cloudSync";

type BackupState = "idle" | "running" | "done" | "error";

export default function CloudBackupButton() {
  const [status, setStatus] = useState<BackupState>("idle");
  const [message, setMessage] = useState("");

  async function handleClick(): Promise<void> {
    setStatus("running");
    setMessage("");

    const result = await flushOutbox();

    if ("skipped" in result) {
      setStatus("done");
      setMessage("login richiesto");
      return;
    }

    if (result.ok) {
      setStatus("done");
      setMessage(`retry ok: ${result.processed} eseguite, ${result.remaining} residue`);
      return;
    }

    setStatus("error");
    setMessage(`retry fallito: ${result.error} (ok=${result.processed}, residue=${result.remaining})`);
  }

  return (
    <div>
      <button type="button" className="buttonGhost" onClick={() => void handleClick()} disabled={status === "running"}>
        {status === "running" ? "Sincronizzazione..." : "Sincronizza ora (retry)"}
      </button>
      <div style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
        Stato: {status}
        {message ? ` (${message})` : ""}
      </div>
    </div>
  );
}
