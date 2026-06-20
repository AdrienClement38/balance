import { useState, useEffect } from "react";
import api, { Profile, Measurement } from "./services/api.ts";
import AuthForm from "./components/AuthForm.tsx";
import ProfileList from "./components/ProfileList.tsx";
import ScaleConnector from "./components/ScaleConnector.tsx";
import MetricCard from "./components/MetricCard.tsx";
import BiaChart from "./components/BiaChart.tsx";

import {
  Scale,
  Activity,
  Flame,
  Droplet,
  Dumbbell,
  Bone,
  AlertCircle,
  LogOut,
  User as UserIcon,
  Sparkles,
  Sun,
  Moon,
  ShieldAlert
} from "lucide-react";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(api.auth.isAuthenticated());
  const [currentUser, setCurrentUser] = useState(api.auth.getCurrentUser());
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<Measurement[]>([]);

  // Thème clair/sombre (par défaut sombre)
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("balance_theme") as "dark" | "light") || "dark"
  );

  // Appliquer la classe de thème sur l'élément racine html
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light-theme");
    } else {
      root.classList.remove("light-theme");
    }
    localStorage.setItem("balance_theme", theme);
  }, [theme]);

  // Charger l'historique quand le profil change
  const fetchHistory = async () => {
    if (activeProfile) {
      try {
        const data = await api.metrics.getHistory(activeProfile.id);
        setHistory(data);
      } catch (err) {
        console.error("Impossible de récupérer l'historique :", err);
      }
    } else {
      setHistory([]);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeProfile]);

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

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Récupérer la dernière pesée
  const lastMeasurement = history[0] || null;

  // Calcul du niveau de santé pour chaque métrique
  const getBmiStatus = (bmi: number) => {
    if (bmi < 18.5) return { label: "Insuffisance pondérale", cat: "warning" as const };
    if (bmi < 25) return { label: "Poids normal (Excellent)", cat: "success" as const };
    if (bmi < 30) return { label: "Surpoids", cat: "warning" as const };
    return { label: "Obésité", cat: "danger" as const };
  };

  const getFatStatus = (fatPct: number, gender: string) => {
    if (gender === "male") {
      if (fatPct < 10) return { label: "Masse grasse très faible", cat: "warning" as const };
      if (fatPct < 20) return { label: "Taux sain (Idéal)", cat: "success" as const };
      if (fatPct < 25) return { label: "Moyen", cat: "warning" as const };
      return { label: "Excès de gras", cat: "danger" as const };
    } else {
      if (fatPct < 18) return { label: "Masse grasse très faible", cat: "warning" as const };
      if (fatPct < 28) return { label: "Taux sain (Idéal)", cat: "success" as const };
      if (fatPct < 33) return { label: "Moyen", cat: "warning" as const };
      return { label: "Excès de gras", cat: "danger" as const };
    }
  };

  const getVisceralStatus = (level: number) => {
    if (level <= 9) return { label: "Niveau sain (Faible risque)", cat: "success" as const };
    if (level <= 14) return { label: "Élevé (Prudence)", cat: "warning" as const };
    return { label: "Très élevé (Risque cardio)", cat: "danger" as const };
  };

  if (!isAuthenticated) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="container">
      {/* Header */}
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
          {/* Bouton de Toggle de Thème */}
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

      {/* Profils Switcher */}
      <ProfileList activeProfile={activeProfile} onSelectProfile={setActiveProfile} />

      {activeProfile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {/* Section Connexion et Graphique */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            <ScaleConnector activeProfile={activeProfile} onMeasurementSaved={fetchHistory} />
            <BiaChart history={history} />
          </div>

          {/* Section d'affichage des cartes de données */}
          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} style={{ color: "var(--accent-light)" }} />
              Dernière analyse corporelle complète
            </h3>

            {lastMeasurement ? (
              <div className="metric-grid">
                
                {/* 1. Poids */}
                <MetricCard
                  title="Poids Corporel"
                  value={parseFloat(lastMeasurement.weightKg).toFixed(1)}
                  unit="kg"
                  icon={<Scale size={20} />}
                  category="primary"
                  label={`Pesé le ${new Date(lastMeasurement.createdAt).toLocaleDateString("fr-FR")}`}
                  progress={100}
                />

                {/* 2. IMC */}
                {(() => {
                  const weight = parseFloat(lastMeasurement.weightKg);
                  const bmi = weight / Math.pow(activeProfile.heightCm / 100, 2);
                  const status = getBmiStatus(bmi);
                  return (
                    <MetricCard
                      title="Indice de Masse Corporelle (IMC)"
                      value={bmi.toFixed(1)}
                      unit=""
                      icon={<Activity size={20} />}
                      category={status.cat}
                      label={status.label}
                      progress={(bmi / 40) * 100}
                    />
                  );
                })()}

                {/* 3. Masse Grasse */}
                {lastMeasurement.fatPct && (() => {
                  const fat = parseFloat(lastMeasurement.fatPct);
                  const status = getFatStatus(fat, activeProfile.gender);
                  return (
                    <MetricCard
                      title="Masse Grasse"
                      value={fat.toFixed(1)}
                      unit="%"
                      icon={<ShieldAlert size={20} />}
                      category={status.cat}
                      label={status.label}
                      progress={fat}
                    />
                  );
                })()}

                {/* 4. Masse Sans Graisse (FFM - Fat-Free Mass) */}
                {lastMeasurement.fatPct && (() => {
                  const weight = parseFloat(lastMeasurement.weightKg);
                  const fat = parseFloat(lastMeasurement.fatPct);
                  const ffmKg = weight - (weight * fat) / 100;
                  return (
                    <MetricCard
                      title="Masse Sans Graisse"
                      value={ffmKg.toFixed(1)}
                      unit="kg"
                      icon={<Dumbbell size={20} />}
                      category="primary"
                      label="Masse maigre totale (organes, muscles, os)"
                      progress={(ffmKg / weight) * 100}
                    />
                  );
                })()}

                {/* 5. Masse Musculaire */}
                {lastMeasurement.musclePct && (() => {
                  const muscle = parseFloat(lastMeasurement.musclePct);
                  return (
                    <MetricCard
                      title="Masse Musculaire"
                      value={muscle.toFixed(1)}
                      unit="%"
                      icon={<Dumbbell size={20} />}
                      category="success"
                      label={muscle > 42 ? "Excellente musculature" : "Musculature normale"}
                      progress={muscle}
                    />
                  );
                })()}

                {/* 6. Eau % */}
                {lastMeasurement.waterPct && (() => {
                  const water = parseFloat(lastMeasurement.waterPct);
                  return (
                    <MetricCard
                      title="Masse Hydrique (Eau)"
                      value={water.toFixed(1)}
                      unit="%"
                      icon={<Droplet size={20} />}
                      category="info"
                      label={water >= 50 ? "Hydratation optimale" : "Hydratation insuffisante"}
                      progress={water}
                    />
                  );
                })()}

                {/* 7. Masse Osseuse */}
                {lastMeasurement.boneMassKg && (() => {
                  const bone = parseFloat(lastMeasurement.boneMassKg);
                  return (
                    <MetricCard
                      title="Masse Osseuse"
                      value={bone.toFixed(1)}
                      unit="kg"
                      icon={<Bone size={20} />}
                      category="primary"
                      label="Masse minérale osseuse estimée"
                      progress={(bone / 6) * 100}
                    />
                  );
                })()}

                {/* 8. Graisse Viscérale */}
                {lastMeasurement.visceralFat !== null && (() => {
                  const visceral = lastMeasurement.visceralFat;
                  const status = getVisceralStatus(visceral);
                  return (
                    <MetricCard
                      title="Graisse Viscérale"
                      value={visceral}
                      unit="nv"
                      icon={<AlertCircle size={20} />}
                      category={status.cat}
                      label={status.label}
                      progress={(visceral / 20) * 100}
                    />
                  );
                })()}

                {/* 9. Métabolisme de Base (BMR) */}
                {lastMeasurement.bmr && (
                  <MetricCard
                    title="Métabolisme de Base (BMR)"
                    value={lastMeasurement.bmr}
                    unit="kcal"
                    icon={<Flame size={20} />}
                    category="warning"
                    label="Besoin métabolique quotidien minimal"
                    progress={100}
                  />
                )}

              </div>
            ) : (
              <div className="glass-panel" style={{ textAlign: "center", padding: "40px" }}>
                <p style={{ color: "var(--text-secondary)" }}>
                  Aucune donnée de pesée disponible. Montez sur la balance pour effectuer votre première analyse !
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ textAlign: "center", padding: "60px 20px", marginTop: "20px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
            Veuillez sélectionner ou créer un profil ci-dessus pour accéder à votre espace de pesée.
          </p>
        </div>
      )}
    </div>
  );
}
export default App;
