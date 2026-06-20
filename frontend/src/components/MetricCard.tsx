import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: ReactNode;
  category: "primary" | "success" | "warning" | "danger" | "info";
  label: string;
  progress?: number; // Pourcentage pour la barre de progression (optionnel)
}

export function MetricCard({
  title,
  value,
  unit,
  icon,
  category,
  label,
  progress,
}: MetricCardProps) {
  return (
    <div className={`glass-panel metric-card ${category}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "8px" }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>{value}</span>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{unit}</span>
          </div>
        </div>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "rgba(255, 255, 255, 0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: `var(--${category === "primary" ? "accent-light" : category})`,
          }}
        >
          {icon}
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        {progress !== undefined && (
          <div
            style={{
              width: "100%",
              height: "4px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "2px",
              overflow: "hidden",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progress))}%`,
                height: "100%",
                background: `var(--${category === "primary" ? "accent" : category})`,
                borderRadius: "2px",
                transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>
        )}
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
          {label}
        </span>
      </div>
    </div>
  );
}
export default MetricCard;
