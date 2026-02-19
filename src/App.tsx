import { useState } from "react";
import "leaflet/dist/leaflet.css";
import "./styles/layout.css";
import DettaglioViaggio from "./pages/DettaglioViaggio";
import GiornoDettaglio from "./pages/GiornoDettaglio";
import Home from "./pages/Home";
import Viaggi from "./pages/Viaggi";

type AppView =
  | { page: "home" }
  | { page: "viaggi" }
  | { page: "dettaglioViaggio"; viaggioId: string }
  | { page: "giornoDettaglio"; viaggioId: string; giornoId: string };

function App() {
  const [view, setView] = useState<AppView>({ page: "home" });

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
