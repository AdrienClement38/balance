import { Profile, Measurement } from "../services/api.ts";
import ScaleConnector from "./ScaleConnector.tsx";
import MetricCard from "./MetricCard.tsx";
import BiaChart from "./BiaChart.tsx";
import ErrorLogPanel from "./ErrorLogPanel.tsx";
import {
  calculateAge,
  calculateBmi,
  calculateFfm,
  getBmiStatus,
  getFatStatus,
  getVisceralStatus,
} from "../lib/bodyMetrics.ts";
import {
  Scale,
  Activity,
  Flame,
  Droplet,
  Dumbbell,
  Bone,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  Info,
} from "lucide-react";

interface DashboardProps {
  activeProfile: Profile;
  history: Measurement[];
  onMeasurementSaved: () => void;
}

export function Dashboard({ activeProfile, history, onMeasurementSaved }: DashboardProps) {
  const lastMeasurement = history[0] || null;

  // Historique chronologique (du plus ancien au plus récent) pour les sparklines.
  const chronHistory = [...history].reverse();
  const num = (v: string | null) => (v ? parseFloat(v) : 0);

  const weightHistory = chronHistory.map((m) => parseFloat(m.weightKg));
  const bmiHistory = chronHistory.map((m) => calculateBmi(parseFloat(m.weightKg), activeProfile.heightCm));
  const fatHistory = chronHistory.map((m) => num(m.fatPct));
  const ffmHistory = chronHistory.map((m) => calculateFfm(parseFloat(m.weightKg), num(m.fatPct)));
  const muscleHistory = chronHistory.map((m) => num(m.musclePct));
  const waterHistory = chronHistory.map((m) => num(m.waterPct));
  const boneHistory = chronHistory.map((m) => num(m.boneMassKg));
  const visceralHistory = chronHistory.map((m) => m.visceralFat || 0);
  const bmrHistory = chronHistory.map((m) => m.bmr || 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Section Haute : Contrôleur Bluetooth + Résumé Profil */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
        <ScaleConnector activeProfile={activeProfile} onMeasurementSaved={onMeasurementSaved} />

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
                <span style={{ fontWeight: 600 }}>{calculateAge(activeProfile.birthdate)} ans</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Taille</span>
                <span style={{ fontWeight: 600 }}>{activeProfile.heightCm} cm</span>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.15)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <Info size={16} style={{ color: "var(--accent-light)", flexShrink: 0 }} />
            <span>Montez sur la balance pour démarrer une pesée et alimenter les indicateurs ci-dessous.</span>
          </div>
        </div>
      </div>

      {/* Cartes de données avec mini-graphique (Sparkline) par carte */}
      <div>
        <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={18} style={{ color: "var(--accent-light)" }} />
          Analyse corporelle historique par métrique (Temps Réel Actif)
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
              const bmi = calculateBmi(parseFloat(lastMeasurement.weightKg), activeProfile.heightCm);
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
              const ffmKg = calculateFfm(weight, parseFloat(lastMeasurement.fatPct));
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

      {/* Graphique d'évolution historique multi-métriques */}
      {history.length > 0 && (
        <div className="metric-grid">
          <BiaChart history={history} />
        </div>
      )}

      {/* Journal des erreurs (impédance basse, échecs d'enregistrement…) */}
      <ErrorLogPanel reloadKey={history.length} />
    </div>
  );
}
export default Dashboard;
