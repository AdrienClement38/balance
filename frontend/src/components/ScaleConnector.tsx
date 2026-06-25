import { useEffect, useState } from "react";
import { useBluetoothScale } from "../hooks/useBluetoothScale.ts";
import api, { Profile } from "../services/api.ts";
import {
  Bluetooth,
  RefreshCw,
  CheckCircle,
  Wifi,
  AlertTriangle,
  Activity,
  Terminal,
  Copy,
} from "lucide-react";

interface ScaleConnectorProps {
  activeProfile: Profile;
  onMeasurementSaved: () => void;
}

export function ScaleConnector({ activeProfile, onMeasurementSaved }: ScaleConnectorProps) {
  const {
    connectionState,
    errorMsg,
    currentWeight,
    currentImpedance,
    finalMeasurement,
    frameLog,
    connect,
    disconnect,
  } = useBluetoothScale();

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);
  // Statut de l'enregistrement de la pesée (distinct de l'état de la connexion).
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retryNonce, setRetryNonce] = useState(0); // incrémenté pour relancer une sauvegarde

  // Enregistrement de la mesure finale, avec PLUSIEURS tentatives : l'important est que
  // la pesée aille jusqu'au bout (on préfère la fiabilité à la vitesse).
  useEffect(() => {
    if (connectionState !== "completed" || !finalMeasurement) {
      setSaveStatus("idle");
      return;
    }

    let cancelled = false;
    const MAX_ATTEMPTS = 6;

    (async () => {
      setSaveStatus("saving");
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await api.metrics.create({
            profileId: activeProfile.id,
            weightKg: finalMeasurement.weightKg,
            impedanceOhms: finalMeasurement.impedanceOhms,
          });
          if (cancelled) return;
          setSaveStatus("saved");
          onMeasurementSaved(); // rafraîchit l'historique / les graphiques
          return;
        } catch (err) {
          console.error(`Sauvegarde de la pesée — tentative ${attempt}/${MAX_ATTEMPTS} échouée :`, err);
          if (cancelled) return;
          // Backoff progressif (1s, 2s, 3s, 4s, 5s) avant la tentative suivante.
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
            if (cancelled) return;
          }
        }
      }
      if (!cancelled) setSaveStatus("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionState, finalMeasurement, activeProfile.id, retryNonce]);

  const copyLog = async () => {
    const text = frameLog
      .map((f) => `${f.ms}ms\t${f.hex}\t${f.note}${f.checksumOk === false ? "  [checksum KO]" : ""}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text || "(aucune trame)");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponible (hors HTTPS) — on ignore silencieusement
    }
  };

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
        return saveStatus === "saved"
          ? "Pesée enregistrée !"
          : saveStatus === "error"
            ? "Échec de l'enregistrement"
            : "Enregistrement en cours...";
      case "error":
        return "Erreur de connexion";
      default:
        return "Prêt";
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case "completed":
        return saveStatus === "error"
          ? "var(--danger)"
          : saveStatus === "saved"
            ? "var(--success)"
            : "var(--accent)";
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
          {connectionState === "completed" && saveStatus === "saved" ? (
            <CheckCircle size={14} />
          ) : connectionState === "error" || (connectionState === "completed" && saveStatus === "error") ? (
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

        {/* Impédance mesurée (preuve que la bio-impédance est bien captée) */}
        {currentImpedance > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "16px",
              fontSize: "0.85rem",
              color: "var(--accent-light)",
              fontWeight: 600,
            }}
          >
            <Activity size={14} />
            <span>Impédance : {currentImpedance} Ω</span>
          </div>
        )}
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

      {connectionState === "completed" && saveStatus === "error" && (
        <div
          style={{
            background: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            borderRadius: "var(--radius-sm)",
            padding: "12px",
            marginBottom: "16px",
          }}
        >
          <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "10px" }}>
            La pesée ({finalMeasurement?.weightKg.toFixed(1)} kg) n'a pas pu être enregistrée
            (réseau ?). Elle n'est pas perdue — réessayez.
          </p>
          <button
            onClick={() => setRetryNonce((n) => n + 1)}
            className="btn btn-primary"
            style={{ width: "100%", height: "40px" }}
          >
            <RefreshCw size={16} />
            <span>Réessayer l'enregistrement</span>
          </button>
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

      {/* Journal de diagnostic des trames brutes (pour caler le protocole sur le matériel réel) */}
      {frameLog.length > 0 && (
        <div style={{ marginTop: "16px", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setShowDiagnostics((s) => !s)}
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Terminal size={14} />
              <span>{showDiagnostics ? "Masquer" : "Diagnostic"} ({frameLog.length} trames)</span>
            </button>
            {showDiagnostics && (
              <button
                onClick={copyLog}
                className="btn btn-secondary"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <Copy size={14} />
                <span>{copied ? "Copié !" : "Copier"}</span>
              </button>
            )}
          </div>

          {showDiagnostics && (
            <div
              style={{
                marginTop: "10px",
                maxHeight: "180px",
                overflowY: "auto",
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px",
                fontFamily: "monospace",
                fontSize: "0.7rem",
                lineHeight: 1.5,
              }}
            >
              {frameLog.map((f, i) => (
                <div
                  key={i}
                  style={{
                    color: f.checksumOk === false ? "var(--danger)" : "var(--text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>{f.ms}ms </span>
                  <span style={{ color: "var(--accent-light)" }}>{f.hex}</span>
                  <span> — {f.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default ScaleConnector;
