import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scrubHandlers } from "../lib/chart.ts";
import { MetricGuidance, STATUS_COLORS } from "../lib/metricGuidance.ts";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: ReactNode;
  category: "primary" | "success" | "warning" | "danger" | "info";
  label: string;
  progress?: number;
  historyValues?: number[]; // Liste ordonnée des valeurs historiques (du plus vieux au plus récent)
  guidance?: MetricGuidance | null; // retour santé repliable (évaluation + explication + conseils)
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
    <div style={{ width: "100%", height: "40px", marginTop: "12px", marginBottom: "8px", touchAction: "none" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "100%", overflow: "visible", touchAction: "none" }}
        {...scrubHandlers(points.map((p) => p.x), width, setActiveIdx)}
      >
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
  guidance,
}: MetricCardProps) {
  // Identifiant unique et SÛR pour le dégradé SVG (les parenthèses d'un titre, ex.
  // "(BMR)", cassaient l'attribut url(...) et donnaient un remplissage noir).
  const gradId = `spark-grad-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.primary;
  const [infoOpen, setInfoOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Mobile-first : sur petit écran, le retour s'ouvre en feuille du bas (bottom sheet) ;
  // sur grand écran, en popover ancré à la carte.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Positionne le popover ANCRÉ (desktop). Sur mobile c'est une feuille du bas, pas de calcul.
  useLayoutEffect(() => {
    if (!infoOpen || isMobile) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      const pop = popRef.current;
      if (!btn || !pop) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const width = Math.min(380, vw - margin * 2);
      // Applique la largeur AVANT de mesurer la hauteur : sinon elle est mesurée à
      // une autre largeur (retours à la ligne différents) et le popover se décale.
      pop.style.width = `${width}px`;
      const popH = pop.offsetHeight;
      const r = btn.getBoundingClientRect();
      const left = Math.max(margin, Math.min(r.left, vw - width - margin));
      let top = r.bottom + 8; // sous le bouton par défaut
      if (popH && top + popH > vh - margin) {
        top = r.top - 8 - popH; // bascule au-dessus s'il déborderait en bas
      }
      // Borne finale : garde le popover dans l'écran même si l'ancre est hors-vue.
      const maxTop = Math.max(margin, vh - margin - popH);
      top = Math.max(margin, Math.min(top, maxTop));
      setPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [infoOpen, isMobile]);

  // Ferme au clic en dehors du popover (et du bouton) ou sur Échap.
  useEffect(() => {
    if (!infoOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  // Mobile : empêche le défilement du fond quand la feuille du bas est ouverte.
  useEffect(() => {
    if (!infoOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [infoOpen, isMobile]);

  // Contenu du retour santé, partagé entre la feuille du bas (mobile) et le popover (desktop).
  const guidanceBody = guidance ? (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: STATUS_COLORS[guidance.status], flexShrink: 0 }} />
        <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{guidance.verdict}</strong>
      </div>
      <p style={{ margin: 0 }}>{guidance.explanation}</p>
      {guidance.tips.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8rem" }}>
            Pour l'améliorer :
          </span>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {guidance.tips.map((t, i) => (
              <li key={i} style={{ marginBottom: "5px" }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  ) : null;

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

      {/* Retour santé : en-tête cliquable inline. Le contenu s'ouvre en POPOVER
          flottant (portal vers <body>) pour passer AU-DESSUS des autres cartes —
          la carte a overflow:hidden et un ancêtre backdrop-filter qui empêcheraient
          un simple position:absolute de déborder. */}
      {guidance && (
        <div style={{ marginTop: "12px", borderTop: "1px solid var(--glass-border)", paddingTop: "10px" }}>
          <button
            ref={btnRef}
            onClick={() => setInfoOpen((o) => !o)}
            aria-expanded={infoOpen}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 0,
              fontSize: "0.78rem",
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS[guidance.status], flexShrink: 0 }} />
              {guidance.verdict}
            </span>
            {infoOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      )}

      {guidance &&
        infoOpen &&
        createPortal(
          isMobile ? (
            // --- Mobile : feuille du bas (bottom sheet) avec fond assombri ---
            <>
              <div
                className="guidance-backdrop"
                style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.5)", zIndex: 999 }}
              />
              <div
                ref={popRef}
                role="dialog"
                aria-label={guidance.verdict}
                className="guidance-sheet"
                style={{
                  position: "fixed",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1000,
                  maxHeight: "85vh",
                  overflowY: "auto",
                  background: "var(--bg-secondary)",
                  borderTopLeftRadius: "var(--radius-lg)",
                  borderTopRightRadius: "var(--radius-lg)",
                  borderTop: "1px solid var(--glass-border)",
                  boxShadow: "0 -10px 40px -8px rgba(0, 0, 0, 0.6)",
                  padding: "8px 20px calc(24px + env(safe-area-inset-bottom))",
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                {/* poignée de glissement (affordance) */}
                <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "var(--glass-border)", margin: "6px auto 16px" }} />
                {guidanceBody}
              </div>
            </>
          ) : (
            // --- Desktop : popover ancré à la carte ---
            <div
              ref={popRef}
              role="dialog"
              aria-label={guidance.verdict}
              className="guidance-popover"
              style={{
                position: "fixed",
                top: pos?.top ?? -9999,
                left: pos?.left ?? 0,
                width: pos?.width ?? 360,
                maxHeight: "calc(100vh - 24px)",
                overflowY: "auto",
                visibility: pos ? "visible" : "hidden",
                zIndex: 1000,
                background: "var(--bg-secondary)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 16px 40px -12px rgba(0, 0, 0, 0.6)",
                padding: "14px 16px",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                lineHeight: 1.55,
              }}
            >
              {guidanceBody}
            </div>
          ),
          document.body
        )}
    </div>
  );
}
export default MetricCard;
