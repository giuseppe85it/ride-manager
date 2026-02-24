import { useEffect, useState } from "react";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import "./styles/layout.css";
import DettaglioViaggio from "./pages/DettaglioViaggio";
import GiornoDettaglio from "./pages/GiornoDettaglio";
import Home from "./pages/Home";
import Viaggi from "./pages/Viaggi";
import { useAuth } from "./context/AuthContext";
import { db } from "./firebase/firestore";
import LoginScreen from "./components/LoginScreen";
import { flushOutbox } from "./services/cloudSync";

type AppView =
  | { page: "home" }
  | { page: "viaggi" }
  | { page: "dettaglioViaggio"; viaggioId: string }
  | { page: "giornoDettaglio"; viaggioId: string; giornoId: string };

function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AppView>({ page: "home" });

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const handleOnline = () => {
      void (async () => {
        try {
          await enableNetwork(db);
        } catch (error) {
          console.warn("Firestore enableNetwork failed", error);
        }

        void flushOutbox();
      })();
    };

    const handleOffline = () => {
      void (async () => {
        try {
          await disableNetwork(db);
        } catch (error) {
          console.warn("Firestore disableNetwork failed", error);
        }
      })();
    };

    if (window.navigator.onLine) {
      handleOnline();
    } else {
      handleOffline();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loading, user]);

  if (loading) return null;

  if (!user) return <LoginScreen />;

  if (view.page === "home") {
    return <Home onOpenViaggi={() => setView({ page: "viaggi" })} />;
  }

  if (view.page === "viaggi") {
    return (
      <Viaggi
        onBackHome={() => setView({ page: "home" })}
        onOpenViaggio={(viaggioId) => setView({ page: "dettaglioViaggio", viaggioId })}
      />
    );
  }

  if (view.page === "dettaglioViaggio") {
    return (
      <DettaglioViaggio
        viaggioId={view.viaggioId}
        onBack={() => setView({ page: "viaggi" })}
        onOpenGiorno={(giornoId) =>
          setView({
            page: "giornoDettaglio",
            viaggioId: view.viaggioId,
            giornoId,
          })
        }
      />
    );
  }

  return (
    <GiornoDettaglio
      giornoId={view.giornoId}
      onBack={() =>
        setView({
          page: "dettaglioViaggio",
          viaggioId: view.viaggioId,
        })
      }
    />
  );
}

export default App;
