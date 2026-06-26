import { ReactNode, useId, useState } from "react";
import { nearestIndexByX } from "../lib/chart.ts";

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

const CATEGORY_COLORS: Record<MetricCardProps["category"], string> = {
  primary: "#6366f1", // Indigo
  success: "#10b981", // Emerald
  warning: "#f59e0b", // Amber
  danger: "#f43f5e", // Coral
  info: "#06b6d4", // Cyan
};

const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

interface SparklineProps {
  values: number[];
  color: string;
  gradId: string;
  unit: string;
}

// Mini-graphique interactif : survol (desktop) ou appui (mobile) sur un point
// affiche sa valeur. Composant au niveau module (pas redéfini à chaque rendu).
function Sparkline({ values, color, gradId, unit }: SparklineProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (values.length < 2) {
    return (
      <div style={{ height: "40px", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "12px", marginBottom: "8px" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>Pas assez d'historique</span>
      </div>
    );
  }

  const width = 240;
  const height = 40;
  const padding = 4;
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const points = values.map((val, idx) => ({
    x: padding + (idx / (values.length - 1)) * (width - padding * 2),
    y: height - padding - ((val - minVal) / range) * (height - padding * 2),
    val,
  }));

  const linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

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

        {/* Point survolé mis en évidence */}
        {activeIdx !== null && (
          <circle cx={points[activeIdx].x} cy={points[activeIdx].y} r="4" fill={color} stroke="var(--bg-primary)" strokeWidth="1.5" />
        )}

        {/* Zone de capture : suit le pointeur / le doigt et sélectionne le point
            le plus proche en X (mode « nearest » + glissé tactile). */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          style={{ touchAction: "pan-y", cursor: "crosshair" }}
          onPointerDown={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (svg) setActiveIdx(nearestIndexByX(e.clientX, svg, points.map((p) => p.x), width));
          }}
          onPointerMove={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (svg) setActiveIdx(nearestIndexByX(e.clientX, svg, points.map((p) => p.x), width));
          }}
          onPointerLeave={() => setActiveIdx(null)}
        />

        {/* Infobulle de la valeur du point actif */}
        {activeIdx !== null && (() => {
          const p = points[activeIdx];
          const text = `${fmtVal(p.val)}${unit ? " " + unit : ""}`;
          const tw = text.length * 5.4 + 12;
          const tx = Math.max(0, Math.min(width - tw, p.x - tw / 2));
          const ty = p.y - 17;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={14} rx={4} fill="var(--bg-primary)" stroke={color} strokeWidth="1" opacity="0.98" />
              <text x={tx + tw / 2} y={ty + 10} fill="var(--text-primary)" fontSize="9" fontWeight="800" textAnchor="middle" fontFamily="var(--font-sans)">
                {text}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
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
  // Identifiant unique et SÛR pour le dégradé SVG (les parenthèses d'un titre, ex.
  // "(BMR)", cassaient l'attribut url(...) et donnaient un remplissage noir).
  const gradId = `spark-grad-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.primary;

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
            color: color,
          }}
        >
          {icon}
        </div>
      </div>

      {/* Mini graphique historique interactif */}
      <Sparkline values={historyValues} color={color} gradId={gradId} unit={unit} />

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
                background: color,
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
