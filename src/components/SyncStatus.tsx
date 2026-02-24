import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RM_LAST_SYNC_AT_KEY } from "../services/cloudSync";
import { listOutbox } from "../services/storage";

function formatLastSync(value: string | null): string {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "-";
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export default function SyncStatus() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [outboxCount, setOutboxCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem(RM_LAST_SYNC_AT_KEY));

  useEffect(() => {
    let isActive = true;

    const refresh = async () => {
      try {
        const items = await listOutbox();
        if (!isActive) {
          return;
        }
        setOutboxCount(items.length);
        setLastSyncAt(localStorage.getItem(RM_LAST_SYNC_AT_KEY));
      } catch {
        if (isActive) {
          setLastSyncAt(localStorage.getItem(RM_LAST_SYNC_AT_KEY));
        }
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isActive = false;
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div style={{ fontSize: "0.85rem", opacity: 0.9, lineHeight: 1.35 }}>
      Auth: {user?.email ?? "Guest"} | {isOnline ? "Online" : "Offline"} | Outbox: {outboxCount} | LastSync:{" "}
      {formatLastSync(lastSyncAt)}
    </div>
  );
}
