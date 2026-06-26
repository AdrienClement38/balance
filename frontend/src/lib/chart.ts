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
