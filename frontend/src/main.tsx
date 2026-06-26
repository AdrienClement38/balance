import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA : applique une nouvelle version AUTOMATIQUEMENT (sans double rechargement
// ni bandeau). Quand un déploiement est détecté, on l'installe et on recharge.
// On revérifie toutes les 60 s pour capter un déploiement même app déjà ouverte.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 1000);
    }
  },
  onNeedRefresh() {
    updateSW(true); // installe la nouvelle version puis recharge
  },
});
