import { useEffect, useRef } from "react";
import { Measurement } from "../services/api.ts";

/**
 * Maintient une connexion WebSocket authentifiée vers le backend et appelle
 * `onMeasurement` à chaque nouvelle pesée concernant le profil actif.
 *
 * La socket ne dépend que de `enabled` : le profil actif et le callback sont lus
 * via des refs, ce qui évite de reconnecter la socket à chaque changement de profil.
 */
export function useRealtimeMeasurements(
  enabled: boolean,
  activeProfileId: string | null,
  onMeasurement: (m: Measurement) => void
) {
  const profileIdRef = useRef(activeProfileId);
  const callbackRef = useRef(onMeasurement);

  useEffect(() => {
    profileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  useEffect(() => {
    callbackRef.current = onMeasurement;
  }, [onMeasurement]);

  useEffect(() => {
    if (!enabled) return;

    // URL WebSocket relative à l'origine courante (même serveur que le frontend).
    // En dev, le proxy Vite redirige /ws vers :3006. wss:// automatiquement en HTTPS.
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number;
    let closedByCleanup = false;

    const connectWs = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connecté.");
        const token = localStorage.getItem("balance_jwt_token");
        if (token) socket?.send(JSON.stringify({ type: "auth", token }));
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === "new_measurement" && parsed.data) {
            const measurement = parsed.data as Measurement;
            if (measurement.profileId === profileIdRef.current) {
              callbackRef.current(measurement);
            }
          }
        } catch (err) {
          console.error("Erreur décodage message WebSocket :", err);
        }
      };

      socket.onclose = () => {
        if (closedByCleanup) return;
        console.log("WebSocket déconnecté, reconnexion dans 5 secondes...");
        reconnectTimeout = window.setTimeout(connectWs, 5000);
      };

      socket.onerror = () => {
        // Souvent transitoire (teardown de page, reconnexion) ; onclose gère la suite.
        console.warn("WebSocket en erreur, tentative de reconnexion à suivre.");
        socket?.close();
      };
    };

    connectWs();

    return () => {
      closedByCleanup = true;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [enabled]);
}
