import { useState, useCallback, useRef } from "react";

export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "stabilizing" // Le poids change en temps réel
  | "measuring_impedance" // Le poids est stable, la balance mesure l'impédance
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
  
  const gattServerRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

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

    if (!navigator.bluetooth) {
      setConnectionState("error");
      setErrorMsg("L'API Web Bluetooth n'est pas supportée ou activée sur ce navigateur. Assurez-vous d'utiliser Chrome/Edge/Opera et d'être en HTTPS.");
      return;
    }

    try {
      // 1. Demander à l'utilisateur de choisir la balance
      // QNScale (Yolanda) diffuse généralement sous le nom "QN-Scale" ou expose le service FFE0
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "QN-Scale" },
          { namePrefix: "QNScale" },
          { services: [0xffe0] }
        ],
        optionalServices: [0xffe0]
      });

      setConnectionState("connecting");

      // Écouter l'événement de déconnexion inattendue
      device.addEventListener("gattserverdisconnected", () => {
        setConnectionState("disconnected");
        console.log("Balance déconnectée.");
      });

      // 2. Se connecter au serveur GATT
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Impossible de se connecter au serveur GATT de la balance.");
      }
      gattServerRef.current = server;
      setConnectionState("connected");

      // 3. Récupérer le service primaire FFE0
      const service = await server.getPrimaryService(0xffe0);

      // 4. Récupérer la caractéristique de notification FFE1
      const characteristic = await service.getCharacteristic(0xffe1);
      characteristicRef.current = characteristic;

      // 5. Commencer à écouter les notifications
      await characteristic.startNotifications();
      
      characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (!value) return;

        // Convertir la DataView en tableau de bytes pour faciliter la lecture
        const bytes = new Uint8Array(value.buffer);
        console.log("Trame reçue (Hex) :", Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" "));

        // Protocole QNScale/Yolanda :
        // La trame commence généralement par 0x0d (13 en décimal) ou 0xfd (253 en décimal)
        if (bytes[0] === 0x0d || bytes[0] === 0xfd) {
          const status = bytes[1];
          
          // Calcul du poids brut
          // Les octets 2 et 3 représentent le poids
          const rawWeight = (bytes[2] << 8) | bytes[3];
          const weight = rawWeight / 100.0; // Divisé par 100 pour avoir les kg

          // Si le poids change (stabilisation en cours)
          // Le statut 0x2c ou similaire indique une valeur temporaire
          if (status === 0x2c || status === 0x20) {
            setConnectionState("stabilizing");
            setCurrentWeight(weight);
          }
          // Si la mesure de poids est stabilisée
          // Le statut 0x24 ou 0x22 indique un poids stable et le début de la mesure d'impédance
          else if (status === 0x24 || status === 0x22 || status === 0x04) {
            setCurrentWeight(weight);
            
            // Calcul de l'impédance (octets 4 et 5)
            const impedance = (bytes[4] << 8) | bytes[5];
            
            console.log(`Poids stable : ${weight} kg | Impédance : ${impedance} ohms`);

            // Si l'impédance est en cours de calcul (parfois envoyée à 0 dans les premières trames de stabilisation)
            if (impedance === 0) {
              setConnectionState("measuring_impedance");
            } else {
              // Mesure complète reçue !
              setConnectionState("completed");
              setFinalMeasurement({
                weightKg: weight,
                impedanceOhms: impedance
              });
              
              // Déconnexion automatique après réussite pour économiser les piles de la balance
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
