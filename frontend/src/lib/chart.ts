import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from "react";

/**
 * Indice du point dont l'abscisse (en coordonnées viewBox) est la plus proche de
 * la position X du pointeur. Permet un affichage « nearest » : pas besoin d'être
 * pile sur un point, et le doigt peut glisser le long de la courbe.
 */
export function nearestIndexByX(
  clientX: number,
  svg: SVGSVGElement,
  pointsX: number[],
  viewBoxWidth: number
): number {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || pointsX.length === 0) return 0;
  const svgX = ((clientX - rect.left) / rect.width) * viewBoxWidth;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pointsX.length; i++) {
    const d = Math.abs(pointsX[i] - svgX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Gestionnaires à étaler sur un <svg> pour un suivi « nearest » qui marche au
 * survol (souris) ET au glissé du doigt (tactile). On combine pointer events et
 * touch events natifs (les pointer events seuls sont parfois capricieux sur
 * mobile). Penser à mettre `touch-action: none` sur le conteneur du SVG.
 */
export function scrubHandlers(
  pointsX: number[],
  viewBoxWidth: number,
  setActive: (index: number | null) => void
) {
  const at = (clientX: number, svg: SVGSVGElement) =>
    setActive(nearestIndexByX(clientX, svg, pointsX, viewBoxWidth));

  return {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture non supporté : sans gravité */
      }
      at(e.clientX, e.currentTarget);
    },
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => at(e.clientX, e.currentTarget),
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* idem */
      }
      setActive(null);
    },
    onPointerLeave: () => setActive(null),
    onTouchStart: (e: ReactTouchEvent<SVGSVGElement>) => {
      const t = e.touches[0];
      if (t) at(t.clientX, e.currentTarget);
    },
    onTouchMove: (e: ReactTouchEvent<SVGSVGElement>) => {
      const t = e.touches[0];
      if (t) at(t.clientX, e.currentTarget);
    },
    onTouchEnd: () => setActive(null),
  };
}
