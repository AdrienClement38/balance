import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";

// Stocke les sockets actives indexées par userId
// Map<userId, Set<WebSocket>>
const activeConnections = new Map<string, Set<WebSocket>>();

export function registerWebSocket(fastify: FastifyInstance) {
  fastify.register(import("@fastify/websocket"));

  fastify.after(() => {
    // connection et req typés en any pour éviter les erreurs de déclaration de type du plugin
    fastify.get("/ws", { websocket: true }, (connection: any, req: any) => {
      let currentUserId: string | null = null;

      connection.socket.on("message", (message: string) => {
        try {
          const parsed = JSON.parse(message);
          
          // 1. Authentification de la socket via le token JWT
          if (parsed.type === "auth" && parsed.token) {
            const decoded = fastify.jwt.verify(parsed.token) as { id: string; email: string };
            currentUserId = decoded.id;
            
            if (!activeConnections.has(currentUserId)) {
              activeConnections.set(currentUserId, new Set());
            }
            
            activeConnections.get(currentUserId)!.add(connection.socket);
            
            connection.socket.send(JSON.stringify({ type: "auth_success" }));
            fastify.log.info(`WebSocket authentifié pour l'utilisateur ${currentUserId}`);
          }
        } catch (err) {
          connection.socket.send(JSON.stringify({ type: "error", message: "Authentification échouée" }));
          connection.socket.close();
        }
      });

      connection.socket.on("close", () => {
        if (currentUserId && activeConnections.has(currentUserId)) {
          const userConns = activeConnections.get(currentUserId)!;
          userConns.delete(connection.socket);
          if (userConns.size === 0) {
            activeConnections.delete(currentUserId);
          }
          fastify.log.info(`WebSocket déconnecté pour l'utilisateur ${currentUserId}`);
        }
      });
    });
  });
}

/**
 * Diffuse un événement à toutes les connexions WebSocket actives d'un utilisateur spécifique.
 */
export function broadcastToUser(userId: string, event: string, data: any) {
  const userConns = activeConnections.get(userId);
  if (userConns && userConns.size > 0) {
    const payload = JSON.stringify({ type: event, data });
    userConns.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    });
  }
}
