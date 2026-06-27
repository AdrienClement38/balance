import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import api, { MyHousehold } from "../services/api.ts";
import { Home, X, Copy, Check, RefreshCw, LogOut, UserMinus, Crown, Plus, LogIn } from "lucide-react";

interface HouseholdPanelProps {
  onClose: () => void;
}

export function HouseholdPanel({ onClose }: HouseholdPanelProps) {
  const [data, setData] = useState<MyHousehold | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.households.getMine());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Échap pour fermer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Enveloppe une action API : gère busy + erreurs + rechargement.
  const run = async (fn: () => Promise<unknown>, reloadAfter = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (reloadAfter) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const household = data?.household ?? null;
  const members = data?.members ?? [];

  const copyCode = async () => {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papier indisponible (hors HTTPS) */
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Maison"
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "480px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "var(--bg-secondary)",
        }}
      >
        {/* En-tête */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <Home size={20} style={{ color: "var(--accent-light)" }} />
            {household ? household.name : "Ma maison"}
          </h3>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: "6px", borderRadius: "50%", width: "34px", height: "34px" }} title="Fermer">
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "18px", lineHeight: 1.5 }}>
          Reliez plusieurs comptes pour partager la même balance. Chacun garde ses propres pesées : les données restent privées.
        </p>

        {error && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "var(--radius-sm)", padding: "10px 12px", color: "var(--danger)", fontSize: "0.83rem", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Chargement…</p>
        ) : !household ? (
          // ----- Aucune maison : créer ou rejoindre -----
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <span style={labelStyle}>Créer une maison</span>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nom (ex. Maison Dupont)"
                  maxLength={100}
                  style={inputStyle}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy || !createName.trim()}
                  onClick={() => run(() => api.households.create(createName.trim()))}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <Plus size={16} /> Créer
                </button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "18px" }}>
              <span style={labelStyle}>Rejoindre avec un code</span>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Code d'invitation"
                  maxLength={16}
                  style={{ ...inputStyle, letterSpacing: "2px", fontFamily: "monospace", textTransform: "uppercase" }}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy || joinCode.trim().length < 4}
                  onClick={() => run(() => api.households.join(joinCode.trim()))}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <LogIn size={16} /> Rejoindre
                </button>
              </div>
            </div>
          </div>
        ) : (
          // ----- Maison existante : code + membres + actions -----
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <span style={labelStyle}>Code d'invitation à partager</span>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                <div
                  style={{
                    flex: 1,
                    fontFamily: "monospace",
                    fontSize: "1.35rem",
                    fontWeight: 800,
                    letterSpacing: "3px",
                    textAlign: "center",
                    padding: "10px",
                    background: "var(--bg-tertiary)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {household.inviteCode}
                </div>
                <button className="btn btn-secondary" onClick={copyCode} title="Copier" style={{ padding: "10px" }}>
                  {copied ? <Check size={18} style={{ color: "var(--success)" }} /> : <Copy size={18} />}
                </button>
                {household.isOwner && (
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => run(() => api.households.regenerateCode())}
                    title="Générer un nouveau code"
                    style={{ padding: "10px" }}
                  >
                    <RefreshCw size={18} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <span style={labelStyle}>Membres ({members.length})</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      {m.isOwner && <Crown size={15} style={{ color: "#f59e0b", flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88rem" }}>
                        {m.email}
                        {m.isMe && <span style={{ color: "var(--text-muted)" }}> (vous)</span>}
                      </span>
                    </div>
                    {household.isOwner && !m.isMe ? (
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => run(() => api.households.removeMember(m.userId))}
                        title="Retirer ce membre"
                        style={{ padding: "6px", flexShrink: 0 }}
                      >
                        <UserMinus size={15} />
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {m.isOwner ? "Propriétaire" : "Membre"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "16px" }}>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  const msg = household.isOwner
                    ? "Dissoudre la maison ? Tous les membres en seront retirés (leurs pesées personnelles sont conservées)."
                    : "Quitter cette maison ?";
                  if (window.confirm(msg)) run(() => api.households.leave());
                }}
                style={{ color: "var(--danger)", width: "100%", justifyContent: "center" }}
              >
                <LogOut size={16} />
                {household.isOwner ? "Dissoudre la maison" : "Quitter la maison"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
export default HouseholdPanel;

const labelStyle = { fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 } as const;

const inputStyle = {
  flex: 1,
  minWidth: 0,
  padding: "10px 12px",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
} as const;
