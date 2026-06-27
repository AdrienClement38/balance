import { useState, useEffect, useCallback } from "react";
import api, { Profile, Measurement } from "./services/api.ts";
import AuthForm from "./components/AuthForm.tsx";
import ProfileList from "./components/ProfileList.tsx";
import Dashboard from "./components/Dashboard.tsx";
import HouseholdPanel from "./components/HouseholdPanel.tsx";
import { useRealtimeMeasurements } from "./hooks/useRealtimeMeasurements.ts";
import { LogOut, User as UserIcon, Sun, Moon, Home } from "lucide-react";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(api.auth.isAuthenticated());
  const [currentUser, setCurrentUser] = useState(api.auth.getCurrentUser());
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<Measurement[]>([]);

  const [showHousehold, setShowHousehold] = useState(false);

  // Thème clair/sombre (par défaut sombre)
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("balance_theme") as "dark" | "light") || "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light-theme", theme === "light");
    localStorage.setItem("balance_theme", theme);
  }, [theme]);

  // Déconnexion propre si l'API signale un token expiré/invalide (401).
  useEffect(() => {
    const onSessionExpired = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setActiveProfile(null);
      setHistory([]);
    };
    window.addEventListener("balance:session-expired", onSessionExpired);
    return () => window.removeEventListener("balance:session-expired", onSessionExpired);
  }, []);

  // Charger l'historique quand le profil change
  const fetchHistory = useCallback(async () => {
    if (!activeProfile) {
      setHistory([]);
      return;
    }
    try {
      const data = await api.metrics.getHistory(activeProfile.id);
      setHistory(data);
    } catch (err) {
      console.error("Impossible de récupérer l'historique :", err);
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Insérer en temps réel les nouvelles pesées du profil actif (sans doublon).
  const handleRealtimeMeasurement = useCallback((m: Measurement) => {
    setHistory((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
  }, []);

  useRealtimeMeasurements(isAuthenticated, activeProfile?.id ?? null, handleRealtimeMeasurement);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(api.auth.getCurrentUser());
  };

  const handleLogout = () => {
    api.auth.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveProfile(null);
    setHistory([]);
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  if (!isAuthenticated) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="container">
      <header className="header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "32px" }}>⚖️</span>
          <div>
            <h1 style={{ fontSize: "1.5rem", background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Balance Connectée
            </h1>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
              Dashboard Local & Sécurisé
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setShowHousehold(true)}
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "50%", width: "38px", height: "38px" }}
            title="Ma maison (partager la balance)"
          >
            <Home size={18} />
          </button>

          <button
            onClick={toggleTheme}
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "50%", width: "38px", height: "38px" }}
            title={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            <UserIcon size={16} />
            <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser?.email}
            </span>
          </div>

          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: "8px 12px", fontSize: "0.85rem" }}>
            <LogOut size={16} />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      <ProfileList activeProfile={activeProfile} onSelectProfile={setActiveProfile} />

      {activeProfile ? (
        <Dashboard activeProfile={activeProfile} history={history} onMeasurementSaved={fetchHistory} />
      ) : (
        <div className="glass-panel" style={{ textAlign: "center", padding: "60px 20px", marginTop: "20px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
            Veuillez sélectionner ou créer un profil ci-dessus pour accéder à votre espace de pesée.
          </p>
        </div>
      )}

      {showHousehold && <HouseholdPanel onClose={() => setShowHousehold(false)} />}
    </div>
  );
}
export default App;
