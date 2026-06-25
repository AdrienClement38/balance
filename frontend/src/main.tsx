import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Le service worker (precache Workbox + mise à jour automatique) est enregistré
// automatiquement par vite-plugin-pwa (injectRegister: "auto"), uniquement en build
// de production. Rien à faire ici.
