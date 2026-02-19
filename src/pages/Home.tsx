import "./Home.css";

interface HomeProps {
  onOpenViaggi: () => void;
}

function showComingSoon(featureName: string): void {
  window.alert(`${featureName}: in arrivo`);
}

export default function Home({ onOpenViaggi }: HomeProps) {
  return (
    <main className="pageWrap">
      <div className="pageContainer">
        <div className="home-layout">
          <header className="home-header">
            <p className="home-kicker">Travel dashboard</p>
            <h1>RideManager</h1>
            <span className="home-badge">{"Offline \u2022 GPX \u2022 PWA"}</span>
          </header>

          <section className="home-grid">
            <button type="button" className="home-card home-card-primary" onClick={onOpenViaggi}>
              <h2>Viaggi</h2>
              <p>Gestisci viaggi e tappe</p>
            </button>

            <button
              type="button"
              className="home-card"
              onClick={() => showComingSoon("Import GPX rapido")}
            >
              <h2>Import GPX rapido</h2>
              <p>In arrivo</p>
            </button>

            <button
              type="button"
              className="home-card"
              onClick={() => showComingSoon("Impostazioni")}
            >
              <h2>Impostazioni</h2>
              <p>In arrivo</p>
            </button>

            <button
              type="button"
              className="home-card"
              onClick={() => showComingSoon("Backup / Export")}
            >
              <h2>Backup / Export</h2>
              <p>In arrivo</p>
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
