// Génère les icônes PNG de la PWA à partir de l'icône vectorielle source.
// Usage : npm run icons
// Produit dans public/ : pwa-192x192.png, pwa-512x512.png, maskable-512x512.png, apple-touch-icon.png
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

// Source "any" : l'icône avec coins arrondis (rendu type icône d'application).
const anySvg = readFileSync(resolve(publicDir, "icon.svg"));

// Variante "maskable" : fond carré plein (sans coins arrondis) pour que le glyphe
// reste intact quand le lanceur applique son propre masque (cercle, squircle...).
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" />
  <g stroke="#ffffff" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="16">
      <line x1="256" y1="168" x2="256" y2="356" />
      <line x1="206" y1="356" x2="306" y2="356" />
      <line x1="152" y1="168" x2="360" y2="168" />
    </g>
    <circle cx="256" cy="148" r="15" fill="#ffffff" stroke="none" />
    <g stroke-width="12">
      <line x1="152" y1="168" x2="120" y2="250" />
      <line x1="152" y1="168" x2="184" y2="250" />
      <path d="M112 250 Q152 298 192 250" />
      <line x1="360" y1="168" x2="328" y2="250" />
      <line x1="360" y1="168" x2="392" y2="250" />
      <path d="M320 250 Q360 298 400 250" />
    </g>
  </g>
</svg>`);

const targets = [
  { src: anySvg, size: 192, out: "pwa-192x192.png" },
  { src: anySvg, size: 512, out: "pwa-512x512.png" },
  { src: maskableSvg, size: 512, out: "maskable-512x512.png" },
  // apple-touch-icon : fond opaque (iOS ne gère pas la transparence ni le SVG).
  { src: maskableSvg, size: 180, out: "apple-touch-icon.png" },
];

for (const { src, size, out } of targets) {
  await sharp(src, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, out));
  console.log(`✓ ${out} (${size}x${size})`);
}

console.log("Icônes PWA générées dans public/.");
