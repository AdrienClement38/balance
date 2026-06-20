import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: ReactNode;
  category: "primary" | "success" | "warning" | "danger" | "info";
  label: string;
  progress?: number;
  historyValues?: number[]; // Liste ordonnée des valeurs historiques (du plus vieux au plus récent)
}

export function MetricCard({
  title,
  value,
  unit,
  icon,
  category,
  label,
  progress,
  historyValues = [],
}: MetricCardProps) {
  
  // Obtenir la couleur associée au type de catégorie
  const getCategoryColor = () => {
    switch (category) {
      case "primary": return "#6366f1"; // Indigo
      case "success": return "#10b981"; // Emerald
      case "warning": return "#f59e0b"; // Amber
      case "danger": return "#f43f5e";  // Coral
      case "info": return "#06b6d4";    // Cyan
      default: return "#6366f1";
    }
  };

  // Composant interne pour dessiner le mini-graphique (Sparkline) en SVG
  const Sparkline = () => {
    if (historyValues.length < 2) {
      return (
        <div style={{ height: "40px", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "12px", marginBottom: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>Pas assez d'historique</span>
        </div>
      );
    }

    const width = 240;
    const height = 40;
    const padding = 4;
    const color = getCategoryColor();

    // Marge minimale pour éviter une ligne plate si toutes les valeurs sont égales
    const minVal = Math.min(...historyValues);
    const maxVal = Math.max(...historyValues);
    const range = maxVal - minVal || 1;

    // Calculer les coordonnées des points
    const points = historyValues.map((val, idx) => {
      const x = padding + (idx / (historyValues.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
      return { x, y };
    });

    const linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    const gradId = `spark-grad-${title.replace(/\s+/g, "-")}-${Math.floor(Math.random() * 1000)}`;

    return (
      <div style={{ width: "100%", height: "40px", marginTop: "12px", marginBottom: "8px" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Cercle sur le dernier point (la mesure la plus récente) */}
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="3.5"
            fill="var(--bg-primary)"
            stroke={color}
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  };

  return (
    <div className={`glass-panel metric-card ${category}`} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "6px" }}>
            <span style={{ fontSize: "1.6rem", fontWeight: 800 }}>{value}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{unit}</span>
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
            color: getCategoryColor(),
          }}
        >
          {icon}
        </div>
      </div>

      {/* Mini graphique historique */}
      <Sparkline />

      <div style={{ marginTop: "8px" }}>
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
                background: getCategoryColor(),
                borderRadius: "2px",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        )}
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
          {label}
        </span>
      </div>
    </div>
  );
}
export default MetricCard;
