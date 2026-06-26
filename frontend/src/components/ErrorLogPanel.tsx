import { useEffect, useState } from "react";
import api, { ErrorLog } from "../services/api.ts";
import { AlertTriangle, ChevronDown, ChevronRight, RotateCw } from "lucide-react";

interface ErrorLogPanelProps {
  reloadKey?: number; // change -> recharge le journal (ex: après une nouvelle pesée)
}

const codeLabel = (code: string) =>
  code === "low_impedance"
    ? "Impédance basse"
    : code === "save_failed"
      ? "Échec d'enregistrement"
      : code === "bluetooth"
        ? "Bluetooth"
        : code;

export function ErrorLogPanel({ reloadKey }: ErrorLogPanelProps) {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setErrors(await api.errors.list(50));
    } catch (e) {
      console.error("Impossible de charger le journal d'erreurs :", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [reloadKey]);

  // Rien à afficher tant qu'aucune erreur n'existe et que le panneau est fermé.
  if (errors.length === 0 && !open) return null;

  return (
    <div className="glass-panel">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <h3 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={18} style={{ color: "#f59e0b" }} />
          Journal d'erreurs{errors.length > 0 ? ` (${errors.length})` : ""}
        </h3>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
            className="btn btn-secondary"
            style={{ padding: "6px 10px", fontSize: "0.8rem" }}
            title="Rafraîchir"
          >
            <RotateCw size={14} />
          </button>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Chargement…</span>}
          {!loading && errors.length === 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Aucune erreur enregistrée. 🎉</span>
          )}
          {errors.map((er) => (
            <div
              key={er.id}
              style={{
                borderLeft: "3px solid #f59e0b",
                padding: "8px 12px",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <span style={{ fontWeight: 600 }}>
                  {codeLabel(er.code)} · {er.profileName}
                </span>
                <span style={{ whiteSpace: "nowrap" }}>{new Date(er.createdAt).toLocaleString("fr-FR")}</span>
              </div>
              <div style={{ fontSize: "0.85rem", marginTop: "4px", color: "var(--text-secondary)" }}>{er.message}</div>
              {(er.weightKg || er.impedanceOhms) && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {er.weightKg ? `Poids ${parseFloat(er.weightKg).toFixed(1)} kg` : ""}
                  {er.weightKg && er.impedanceOhms ? " · " : ""}
                  {er.impedanceOhms ? `Impédance ${er.impedanceOhms} Ω` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default ErrorLogPanel;
