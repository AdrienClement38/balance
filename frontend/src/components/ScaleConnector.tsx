import { useEffect } from "react";
import { useBluetoothScale } from "../hooks/useBluetoothScale.ts";
import api, { Profile } from "../services/api.ts";
import { Bluetooth, RefreshCw, CheckCircle, Wifi, AlertTriangle } from "lucide-react";

interface ScaleConnectorProps {
  activeProfile: Profile;
  onMeasurementSaved: () => void;
}

export function ScaleConnector({ activeProfile, onMeasurementSaved }: ScaleConnectorProps) {
  const {
    connectionState,
    errorMsg,
    currentWeight,
    finalMeasurement,
    connect,
    disconnect,
  } = useBluetoothScale();

  // Déclencher l'enregistrement API lorsque la mesure finale est reçue
  useEffect(() => {
    if (connectionState === "completed" && finalMeasurement) {
      const saveMeasurement = async () => {
        try {
          await api.metrics.create({
            profileId: activeProfile.id,
            weightKg: finalMeasurement.weightKg,
            impedanceOhms: finalMeasurement.impedanceOhms,
          });
          // Alerter le parent pour rafraîchir les graphiques
          onMeasurementSaved();
        } catch (err) {
          console.error("Erreur lors de la sauvegarde de la mesure :", err);
        }
      };

      saveMeasurement();
    }
  }, [connectionState, finalMeasurement, activeProfile.id]);

  const getStatusText = () => {
    switch (connectionState) {
      case "disconnected":
        return "Prêt pour une pesée";
      case "scanning":
        return "Recherche de la balance...";
      case "connecting":
        return "Connexion établie, initialisation...";
      case "connected":
        return "Connecté ! Montez sur la balance.";
      case "stabilizing":
        return "Stabilisation du poids...";
      case "measuring_impedance":
        return "Analyse de la masse corporelle...";
      case "completed":
        return "Pesée enregistrée !";
      case "error":
        return "Erreur de connexion";
      default:
        return "Prêt";
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case "completed":
        return "var(--success)";
      case "error":
        return "var(--danger)";
      case "disconnected":
        return "var(--text-secondary)";
      default:
        return "var(--accent)";
    }
  };

  return (
    <div className="glass-panel" style={{ textAlign: "center", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "1.1rem" }}>Connexion Balance</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: getStatusColor() }}>
          {connectionState === "completed" ? (
            <CheckCircle size={14} />
          ) : connectionState === "error" ? (
            <AlertTriangle size={14} />
          ) : connectionState !== "disconnected" ? (
            <RefreshCw size={14} className="pulse-glow" style={{ animation: "pulse 1.5s infinite linear" }} />
          ) : (
            <Wifi size={14} />
          )}
          <span style={{ fontWeight: 500 }}>{getStatusText()}</span>
        </div>
      </div>

      <div style={{ margin: "32px 0" }}>
        <div
          className={connectionState !== "disconnected" && connectionState !== "completed" && connectionState !== "error" ? "pulse-glow" : ""}
          style={{
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            background: "rgba(0, 0, 0, 0.4)",
            border: `3px solid ${getStatusColor()}`,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.4s ease",
          }}
        >
          <span style={{ fontSize: "2.75rem", fontWeight: 800, color: "var(--text-primary)" }}>
            {currentWeight > 0 ? currentWeight.toFixed(2) : "0.00"}
          </span>
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            kg
          </span>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            background: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            borderRadius: "var(--radius-sm)",
            padding: "10px",
            color: "var(--danger)",
            fontSize: "0.85rem",
            marginBottom: "16px",
          }}
        >
          {errorMsg}
        </div>
      )}

      {connectionState === "disconnected" || connectionState === "completed" || connectionState === "error" ? (
        <button onClick={connect} className="btn btn-primary" style={{ width: "100%", height: "46px" }}>
          <Bluetooth size={18} />
          <span>Lancer une pesée</span>
        </button>
      ) : (
        <button onClick={disconnect} className="btn btn-secondary" style={{ width: "100%", height: "46px" }}>
          <span>Annuler la connexion</span>
        </button>
      )}
    </div>
  );
}
export default ScaleConnector;
