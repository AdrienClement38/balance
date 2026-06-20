import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0", // Permet d'accéder au serveur de dev depuis un smartphone connecté sur le même réseau WiFi
  },
});
