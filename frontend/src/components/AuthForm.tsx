import React, { useState } from "react";
import api from "../services/api.ts";
import { KeyRound, Mail, UserPlus, LogIn, AlertCircle } from "lucide-react";

interface AuthFormProps {
  onAuthSuccess: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await api.auth.login(email, password);
        onAuthSuccess();
      } else {
        await api.auth.register(email, password);
        // Après inscription, connecter directement
        await api.auth.login(email, password);
        onAuthSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de la connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "420px", margin: "80px auto 20px" }}>
      <div className="glass-panel glass-panel-glow" style={{ padding: "40px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <span style={{ fontSize: "48px" }}>⚖️</span>
          <h2 style={{ marginTop: "16px", fontSize: "1.75rem" }}>
            {isLogin ? "Ravi de vous revoir" : "Créer un compte"}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "8px" }}>
            Connectez-vous à votre espace santé local.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              color: "var(--danger)",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="email-input">Adresse email</label>
            <div style={{ position: "relative" }}>
              <Mail
                size={18}
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                id="email-input"
                className="input-field"
                style={{ paddingLeft: "44px" }}
                type="email"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: "32px" }}>
            <label className="input-label" htmlFor="password-input">Mot de passe</label>
            <div style={{ position: "relative" }}>
              <KeyRound
                size={18}
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                id="password-input"
                className="input-field"
                style={{ paddingLeft: "44px" }}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", height: "48px" }}
            disabled={loading}
          >
            {loading ? (
              <span>Chargement...</span>
            ) : isLogin ? (
              <>
                <LogIn size={18} />
                <span>Se connecter</span>
              </>
            ) : (
              <>
                <UserPlus size={18} />
                <span>S'inscrire</span>
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center", fontSize: "0.9rem" }}>
          <span style={{ color: "var(--text-secondary)" }}>
            {isLogin ? "Nouveau sur l'application ? " : "Déjà un compte ? "}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-light)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {isLogin ? "Créer un profil" : "Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}
export default AuthForm;
