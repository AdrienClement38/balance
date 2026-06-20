import { useState, useCallback, useRef } from "react";

export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "stabilizing"
  | "measuring_impedance"
  | "completed"
  | "error";

export interface ScaleMeasurement {
  weightKg: number;
  impedanceOhms: number;
}

export function useBluetoothScale() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [finalMeasurement, setFinalMeasurement] = useState<ScaleMeasurement | null>(null);
  
  const gattServerRef = useRef<any | null>(null);
  const characteristicRef = useRef<any | null>(null);

  const disconnect = useCallback(() => {
    if (gattServerRef.current && gattServerRef.current.connected) {
      gattServerRef.current.disconnect();
    }
    setConnectionState("disconnected");
    setCurrentWeight(0);
    setFinalMeasurement(null);
  }, []);

  const connect = useCallback(async () => {
    setErrorMsg(null);
    setConnectionState("scanning");
    setCurrentWeight(0);
    setFinalMeasurement(null);

    const nav = navigator as any;

    if (!nav.bluetooth) {
      setConnectionState("error");
      setErrorMsg("L'API Web Bluetooth n'est pas supportée ou activée sur ce navigateur. Assurez-vous d'utiliser Chrome/Edge/Opera et d'être en HTTPS.");
      return;
    }

    try {
      let device: any = null;

      // 1. Tenter de récupérer un appareil déjà autorisé dans le passé (getDevices)
      if (nav.bluetooth.getDevices) {
        const permittedDevices = await nav.bluetooth.getDevices();
        const existingScale = permittedDevices.find(
          (d: any) => d.name?.startsWith("QN-Scale") || d.name?.startsWith("QNScale")
        );

        if (existingScale) {
          console.log("Balance déjà autorisée détectée, connexion directe...", existingScale.name);
          device = existingScale;
        }
      }

      // 2. Si aucun appareil n'a été pré-autorisé, on demande à l'utilisateur via le pop-up
      if (!device) {
        console.log("Aucun appareil pré-autorisé trouvé, ouverture du sélecteur...");
        device = await nav.bluetooth.requestDevice({
          filters: [
            { namePrefix: "QN-Scale" },
            { namePrefix: "QNScale" },
            { services: [0xffe0] }
          ],
          optionalServices: [0xffe0]
        });
      }

      setConnectionState("connecting");

      // Écouter l'événement de déconnexion inattendue
      device.addEventListener("gattserverdisconnected", () => {
        setConnectionState("disconnected");
        console.log("Balance déconnectée.");
      });

      // 3. Se connecter au serveur GATT
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Impossible de se connecter au serveur GATT de la balance.");
      }
      gattServerRef.current = server;
      setConnectionState("connected");

      // 4. Récupérer le service primaire FFE0
      const service = await server.getPrimaryService(0xffe0);

      // 5. Récupérer la caractéristique de notification FFE1
      const characteristic = await service.getCharacteristic(0xffe1);
      characteristicRef.current = characteristic;

      // 6. Commencer à écouter les notifications
      await characteristic.startNotifications();
      
      characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
        const target = event.target as any;
        const value = target.value;
        if (!value) return;

        const bytes = new Uint8Array(value.buffer);
        console.log("Trame reçue (Hex) :", Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" "));

        if (bytes[0] === 0x0d || bytes[0] === 0xfd) {
          const status = bytes[1];
          const rawWeight = (bytes[2] << 8) | bytes[3];
          const weight = rawWeight / 100.0;

          if (status === 0x2c || status === 0x20) {
            setConnectionState("stabilizing");
            setCurrentWeight(weight);
          }
          else if (status === 0x24 || status === 0x22 || status === 0x04) {
            setCurrentWeight(weight);
            const impedance = (bytes[4] << 8) | bytes[5];
            
            console.log(`Poids stable : ${weight} kg | Impédance : ${impedance} ohms`);

            if (impedance === 0) {
              setConnectionState("measuring_impedance");
            } else {
              setConnectionState("completed");
              setFinalMeasurement({
                weightKg: weight,
                impedanceOhms: impedance
              });
              
              if (server.connected) {
                server.disconnect();
              }
            }
          }
        }
      });

      console.log("Notifications activées, en attente de pesée...");

    } catch (err: any) {
      console.error("Erreur Web Bluetooth :", err);
      setConnectionState("error");
      setErrorMsg(err.message || "Une erreur est survenue lors de la connexion Bluetooth.");
    }
  }, []);

  return {
    connectionState,
    errorMsg,
    currentWeight,
    finalMeasurement,
    connect,
    disconnect,
  };
}
