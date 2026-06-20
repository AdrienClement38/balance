import { useState } from "react";
import { Measurement } from "../services/api.ts";
import { TrendingUp } from "lucide-react";

interface BiaChartProps {
  history: Measurement[];
}

type MetricType = "weight" | "fat" | "ffm" | "muscle" | "water" | "bone" | "visceral" | "bmr";

export function BiaChart({ history }: BiaChartProps) {
  const [metric, setMetric] = useState<MetricType>("weight");

  if (history.length === 0) {
    return (
      <div className="glass-panel" style={{ height: "300px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Aucun historique disponible pour ce profil. Lancer une pesée !</p>
      </div>
    );
  }

  // Trier par date croissante
  const sortedData = [...history].reverse();

  // Extraire les valeurs à afficher
  const getVal = (m: Measurement) => {
    const w = parseFloat(m.weightKg);
    const f = m.fatPct ? parseFloat(m.fatPct) : 0;
    
    switch (metric) {
      case "weight":
        return w;
      case "fat":
        return f;
      case "ffm":
        // Masse sans graisse (calculée = poids - masse grasse)
        return w - (w * f) / 100;
      case "muscle":
        return m.musclePct ? parseFloat(m.musclePct) : 0;
      case "water":
        return m.waterPct ? parseFloat(m.waterPct) : 0;
      case "bone":
        return m.boneMassKg ? parseFloat(m.boneMassKg) : 0;
      case "visceral":
        return m.visceralFat || 0;
      case "bmr":
        return m.bmr || 0;
      default:
        return 0;
    }
  };

  const values = sortedData.map(getVal);
  const minVal = Math.min(...values) * 0.98; // Marge basse de 2%
  const maxVal = Math.max(...values) * 1.02; // Marge haute de 2%
  const valRange = maxVal - minVal || 1;

  // Dimensions SVG
  const width = 600;
  const height = 240;
  const padding = 40;

  // Calculer les coordonnées des points
  const points = sortedData.map((d, index) => {
    const x = padding + (index / (sortedData.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((getVal(d) - minVal) / valRange) * (height - padding * 2);
    return { x, y, val: getVal(d), date: new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) };
  });

  let linePath = "";
  let areaPath = "";

  if (points.length > 1) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  } else if (points.length === 1) {
    linePath = `M ${padding} ${height / 2} L ${width - padding} ${height / 2}`;
  }

  const getMetricLabel = () => {
    switch (metric) {
      case "weight": return "Poids (kg)";
      case "fat": return "Masse grasse (%)";
      case "ffm": return "Masse sans graisse (kg)";
      case "muscle": return "Masse musculaire (%)";
      case "water": return "Masse hydrique (%)";
      case "bone": return "Masse osseuse (kg)";
      case "visceral": return "Graisse viscérale (niveau)";
      case "bmr": return "Métabolisme (kcal)";
    }
  };

  const metricTypes: { type: MetricType; label: string }[] = [
    { type: "weight", label: "Poids" },
    { type: "fat", label: "Gras %" },
    { type: "ffm", label: "Sans gras" },
    { type: "muscle", label: "Muscle %" },
    { type: "water", label: "Eau %" },
    { type: "bone", label: "Os (kg)" },
    { type: "visceral", label: "Viscérale" },
    { type: "bmr", label: "BMR" }
  ];

  return (
    <div className="glass-panel" style={{ gridColumn: "span 2" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <TrendingUp size={20} style={{ color: "var(--accent)" }} />
          <h3 style={{ fontSize: "1.1rem" }}>Évolution {getMetricLabel()}</h3>
        </div>
        
        {/* Toggle Buttons pour TOUTES les métriques */}
        <div style={{ 
          display: "flex", 
          gap: "6px", 
          background: "rgba(255, 255, 255, 0.03)", 
          borderRadius: "var(--radius-sm)", 
          padding: "6px", 
          border: "1px solid var(--glass-border)",
          overflowX: "auto",
          whiteSpace: "nowrap"
        }}>
          {metricTypes.map((t) => (
            <button
              key={t.type}
              onClick={() => setMetric(t.type)}
              style={{
                background: metric === t.type ? "var(--accent)" : "none",
                border: "none",
                color: metric === t.type ? "#fff" : "var(--text-secondary)",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: "6px",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: "all 0.2s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grille */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding + ratio * (height - padding * 2);
            const val = maxVal - ratio * valRange;
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid" />
                <text
                  x={padding - 8}
                  y={y + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                  textAnchor="end"
                  fontWeight="600"
                  fontFamily="var(--font-sans)"
                >
                  {val.toFixed(metric === "weight" || metric === "ffm" || metric === "bone" ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {/* Courbes */}
          {points.length > 1 && (
            <>
              <path d={areaPath} className="chart-area" />
              <path d={linePath} className="chart-path" />
            </>
          )}

          {/* Cercles de données */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill="var(--bg-primary)"
                stroke="var(--accent)"
                strokeWidth="3"
                style={{ cursor: "pointer" }}
              />
              <text
                x={p.x}
                y={p.y - 12}
                fill="var(--text-primary)"
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
                fontFamily="var(--font-sans)"
              >
                {p.val.toFixed(metric === "weight" || metric === "ffm" || metric === "bone" ? 1 : 0)}
              </text>
              {(points.length < 6 || i % Math.ceil(points.length / 5) === 0 || i === points.length - 1) && (
                <text
                  x={p.x}
                  y={height - padding + 18}
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontWeight="500"
                  textAnchor="middle"
                  fontFamily="var(--font-sans)"
                >
                  {p.date}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
export default BiaChart;
