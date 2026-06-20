import { useState, useEffect } from "react";
import api, { Profile, Measurement } from "./services/api.ts";
import AuthForm from "./components/AuthForm.tsx";
import ProfileList from "./components/ProfileList.tsx";
import ScaleConnector from "./components/ScaleConnector.tsx";
import MetricCard from "./components/MetricCard.tsx";

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
  ShieldAlert,
  Info
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
      if (fatPct < 10) return { label: "Taux très faible", cat: "warning" as const };
      if (fatPct < 20) return { label: "Taux sain (Idéal)", cat: "success" as const };
      if (fatPct < 25) return { label: "Moyen", cat: "warning" as const };
      return { label: "Excès de gras", cat: "danger" as const };
    } else {
      if (fatPct < 18) return { label: "Taux très faible", cat: "warning" as const };
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

  // Fonction utilitaire pour calculer l'âge
  const getAge = (birthdateStr: string) => {
    const birthdate = new Date(birthdateStr);
    const today = new Date();
    let age = today.getFullYear() - birthdate.getFullYear();
    const monthDiff = today.getMonth() - birthdate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
      age--;
    }
    return age;
  };

  // Extraire les valeurs historiques chronologiques (du plus ancien au plus récent)
  const chronHistory = [...history].reverse();

  // Mappings historiques pour les mini-graphiques
  const weightHistory = chronHistory.map(m => parseFloat(m.weightKg));
  const bmiHistory = chronHistory.map(m => {
    const w = parseFloat(m.weightKg);
    return w / Math.pow((activeProfile?.heightCm || 175) / 100, 2);
  });
  const fatHistory = chronHistory.map(m => m.fatPct ? parseFloat(m.fatPct) : 0);
  const ffmHistory = chronHistory.map(m => {
    const w = parseFloat(m.weightKg);
    const f = m.fatPct ? parseFloat(m.fatPct) : 0;
    return w - (w * f) / 100;
  });
  const muscleHistory = chronHistory.map(m => m.musclePct ? parseFloat(m.musclePct) : 0);
  const waterHistory = chronHistory.map(m => m.waterPct ? parseFloat(m.waterPct) : 0);
  const boneHistory = chronHistory.map(m => m.boneMassKg ? parseFloat(m.boneMassKg) : 0);
  const visceralHistory = chronHistory.map(m => m.visceralFat || 0);
  const bmrHistory = chronHistory.map(m => m.bmr || 0);

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
          
          {/* Section Haute : Contrôleur Bluetooth + Résumé Profil */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            
            <ScaleConnector activeProfile={activeProfile} onMeasurementSaved={fetchHistory} />
            
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkles size={18} style={{ color: "var(--accent-light)" }} />
                  Synthèse du profil
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "8px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Prénom</span>
                    <span style={{ fontWeight: 600 }}>{activeProfile.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "8px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Genre</span>
                    <span style={{ fontWeight: 600 }}>{activeProfile.gender === "male" ? "Homme" : "Femme"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "8px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Âge</span>
                    <span style={{ fontWeight: 600 }}>{getAge(activeProfile.birthdate)} ans</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Taille</span>
                    <span style={{ fontWeight: 600 }}>{activeProfile.heightCm} cm</span>
                  </div>
                </div>
              </div>
              
              <div style={{ 
                background: "rgba(99, 102, 241, 0.05)", 
                border: "1px solid rgba(99, 102, 241, 0.15)", 
                borderRadius: "var(--radius-sm)", 
                padding: "12px 16px", 
                fontSize: "0.85rem", 
                color: "var(--text-secondary)",
                display: "flex",
                gap: "8px",
                alignItems: "center"
              }}>
                <Info size={16} style={{ color: "var(--accent-light)", flexShrink: 0 }} />
                <span>Sélectionnez ou créez un profil ci-dessus avant de démarrer une pesée.</span>
              </div>
            </div>

          </div>

          {/* Section d'affichage des cartes de données avec mini-graphique (Sparkline) par carte */}
          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} style={{ color: "var(--accent-light)" }} />
              Analyse corporelle historique par métrique
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
                  label={`Dernier : ${new Date(lastMeasurement.createdAt).toLocaleDateString("fr-FR")}`}
                  progress={100}
                  historyValues={weightHistory}
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
                      historyValues={bmiHistory}
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
                      historyValues={fatHistory}
                    />
                  );
                })()}

                {/* 4. Masse Sans Graisse (FFM) */}
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
                      label="Masse maigre brute totale"
                      progress={(ffmKg / weight) * 100}
                      historyValues={ffmHistory}
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
                      historyValues={muscleHistory}
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
                      historyValues={waterHistory}
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
                      label="Masse osseuse estimée"
                      progress={(bone / 6) * 100}
                      historyValues={boneHistory}
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
                      historyValues={visceralHistory}
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
                    label="Besoin métabolique quotidien"
                    progress={100}
                    historyValues={bmrHistory}
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
