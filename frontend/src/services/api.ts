const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3006/api";

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  name: string;
  gender: "male" | "female";
  birthdate: string; // YYYY-MM-DD
  heightCm: number;
  createdAt: string;
}

export interface Measurement {
  id: string;
  profileId: string;
  weightKg: string; // decimal type in PostgreSQL returned as string
  impedanceOhms: number;
  fatPct: string | null;
  musclePct: string | null;
  waterPct: string | null;
  boneMassKg: string | null;
  bmr: number | null;
  visceralFat: number | null;
  createdAt: string;
}

// Récupérer le token depuis le stockage local
function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("balance_jwt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Fonction générique fetch avec typage et gestion d'erreurs
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Token expiré/invalide sur un appel authentifié -> session expirée.
  // (On exclut /auth/* : un 401 sur login = mauvais identifiants, pas une session.)
  if (response.status === 401 && !endpoint.startsWith("/auth")) {
    localStorage.removeItem("balance_jwt_token");
    localStorage.removeItem("balance_user");
    window.dispatchEvent(new CustomEvent("balance:session-expired"));
  }

  if (!response.ok) {
    let errorMessage = "Une erreur est survenue lors de la communication avec le serveur.";
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Pas de JSON dans la réponse d'erreur
    }
    throw new Error(errorMessage);
  }

  // Si code 24 (No Content), on résout directement
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  // --- Authentification ---
  auth: {
    async register(email: string, password: string): Promise<User> {
      return apiFetch<User>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    async login(email: string, password: string): Promise<{ user: User; token: string }> {
      const data = await apiFetch<{ user: User; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // Sauvegarder le token
      localStorage.setItem("balance_jwt_token", data.token);
      localStorage.setItem("balance_user", JSON.stringify(data.user));
      return data;
    },

    logout() {
      localStorage.removeItem("balance_jwt_token");
      localStorage.removeItem("balance_user");
    },

    getCurrentUser(): User | null {
      const userJson = localStorage.getItem("balance_user");
      return userJson ? JSON.parse(userJson) : null;
    },

    isAuthenticated(): boolean {
      return !!localStorage.getItem("balance_jwt_token");
    }
  },

  // --- Profils physiques ---
  profiles: {
    async list(): Promise<Profile[]> {
      return apiFetch<Profile[]>("/profiles");
    },

    async create(profile: Omit<Profile, "id" | "createdAt">): Promise<Profile> {
      return apiFetch<Profile>("/profiles", {
        method: "POST",
        body: JSON.stringify(profile),
      });
    },

    async update(id: string, profile: Partial<Omit<Profile, "id" | "createdAt">>): Promise<Profile> {
      return apiFetch<Profile>(`/profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify(profile),
      });
    },

    async delete(id: string): Promise<void> {
      return apiFetch<void>(`/profiles/${id}`, {
        method: "DELETE",
      });
    }
  },

  // --- Métriques et pesées ---
  metrics: {
    async create(measurement: { profileId: string; weightKg: number; impedanceOhms: number }): Promise<Measurement> {
      return apiFetch<Measurement>("/metrics", {
        method: "POST",
        body: JSON.stringify(measurement),
      });
    },

    async getHistory(profileId: string, limit: number = 50): Promise<Measurement[]> {
      return apiFetch<Measurement[]>(`/metrics/${profileId}?limit=${limit}`);
    }
  }
};
export default api;
