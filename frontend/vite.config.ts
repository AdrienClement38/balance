import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA gérée par Workbox : precache automatique de TOUS les assets hashés produits
    // par le build, invalidation de cache versionnée à chaque release, et enregistrement
    // du service worker injecté automatiquement. Remplace l'ancien sw.js écrit à la main.
    VitePWA({
      // "prompt" + enregistrement manuel dans main.tsx : on applique la mise à jour
      // nous-mêmes (updateSW(true)) dès qu'un déploiement est détecté -> rechargement
      // automatique, sans bandeau ni double rechargement manuel.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Balance Connectée",
        short_name: "Balance",
        description:
          "Suivi local et sécurisé de votre poids et de votre composition corporelle via une balance Bluetooth.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0d0e12",
        theme_color: "#0d0e12",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // Précache l'intégralité de la coquille applicative (avec révisions de contenu).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Toute navigation retombe sur l'index précaché (SPA), SAUF l'API et le WebSocket.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // L'API REST et le WebSocket ne sont JAMAIS mis en cache.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api") || url.pathname.startsWith("/ws"),
            handler: "NetworkOnly",
          },
          {
            // Polices Google : cache long, sans bloquer le premier rendu.
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" ||
              url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Pas de service worker en développement (évite d'interférer avec le HMR de Vite).
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: "0.0.0.0", // Permet d'accéder au serveur de dev depuis un smartphone connecté sur le même réseau WiFi
    // En dev, on redirige les appels relatifs /api et /ws vers le backend (port 3006),
    // pour que le même code (URLs relatives) fonctionne en dev comme en production "1 seul site".
    proxy: {
      // 127.0.0.1 (et non localhost) pour forcer l'IPv4 et éviter ECONNREFUSED sur ::1.
      "/api": { target: "http://127.0.0.1:3006", changeOrigin: true },
      "/ws": { target: "http://127.0.0.1:3006", ws: true },
    },
  },
});
