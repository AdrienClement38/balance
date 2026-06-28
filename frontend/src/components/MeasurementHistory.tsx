import { useState } from "react";
import api, { Measurement } from "../services/api.ts";
import { History, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

interface MeasurementHistoryProps {
  history: Measurement[];
  onDeleted: () => void;
}

export function MeasurementHistory({ history, onDeleted }: MeasurementHistoryProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (history.length === 0) return null;

  const remove = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette pesée ?")) return;
    setDeleting(id);
    try {
      await api.metrics.delete(id);
      onDeleted(); // recharge l'historique (graphiques + cartes)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la suppression.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="glass-panel">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <h3 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <History size={18} style={{ color: "var(--accent-light)" }} />
          Historique des pesées ({history.length})
        </h3>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>

      {open && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {history.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                  {parseFloat(m.weightKg).toFixed(1)} kg
                  {m.fatPct && (
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> · {parseFloat(m.fatPct).toFixed(1)}% gras</span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {new Date(m.createdAt).toLocaleString("fr-FR")}
                  {m.impedanceOhms > 0 ? ` · ${m.impedanceOhms} Ω` : " · sans impédance"}
                </div>
              </div>
              <button
                onClick={() => remove(m.id)}
                disabled={deleting === m.id}
                className="btn btn-secondary"
                title="Supprimer cette pesée"
                style={{ padding: "8px", flexShrink: 0, color: "var(--danger)" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default MeasurementHistory;
