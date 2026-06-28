import React, { useState, useEffect } from "react";
import api, { Profile } from "../services/api.ts";
import { User, Plus, X, Trash2, Calendar, Ruler, UserCheck } from "lucide-react";

interface ProfileListProps {
  activeProfile: Profile | null;
  onSelectProfile: (profile: Profile) => void;
}

export function ProfileList({ activeProfile, onSelectProfile }: ProfileListProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Champs formulaire
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState(175);
  
  const [error, setError] = useState<string | null>(null);

  // Sélectionne un profil ET mémorise son id, pour le restaurer après un rechargement.
  const selectProfile = (profile: Profile) => {
    localStorage.setItem("balance_active_profile_id", profile.id);
    onSelectProfile(profile);
  };

  const fetchProfiles = async () => {
    try {
      const data = await api.profiles.list();
      setProfiles(data);
      if (data.length > 0 && !activeProfile) {
        // Restaurer le dernier profil utilisé (sinon le premier).
        const savedId = localStorage.getItem("balance_active_profile_id");
        selectProfile(data.find((p) => p.id === savedId) ?? data[0]);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const newProfile = await api.profiles.create({
        name,
        gender,
        birthdate,
        heightCm,
      });
      setProfiles([...profiles, newProfile]);
      selectProfile(newProfile);
      setShowAddModal(false);
      // Reset form
      setName("");
      setBirthdate("");
      setHeightCm(175);
    } catch (err: any) {
      setError(err.message || "Impossible de créer le profil.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Éviter de sélectionner le profil en cliquant sur supprimer
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce profil ? Toutes ses données de pesées associées seront effacées définitivement.")) {
      return;
    }

    try {
      await api.profiles.delete(id);
      const updated = profiles.filter((p) => p.id !== id);
      setProfiles(updated);
      if (activeProfile?.id === id) {
        if (updated.length > 0) {
          selectProfile(updated[0]);
        } else {
          // Aucun profil restant
          localStorage.removeItem("balance_active_profile_id");
          // @ts-ignore
          onSelectProfile(null);
        }
      }
    } catch (err: any) {
      alert(err.message || "Erreur lors de la suppression.");
    }
  };

  return (
    <div style={{ marginBottom: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "1.1rem", color: "var(--text-secondary)" }}>Profils de la famille</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-secondary"
          style={{ padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={16} />
          <span>Ajouter</span>
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ color: "var(--text-secondary)" }}>Aucun profil créé. Veuillez en ajouter un pour commencer à utiliser la balance.</p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
          {profiles.map((profile) => {
            const isActive = activeProfile?.id === profile.id;
            return (
              <div
                key={profile.id}
                onClick={() => selectProfile(profile)}
                className="glass-panel"
                style={{
                  minWidth: "180px",
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderColor: isActive ? "var(--accent)" : "var(--glass-border)",
                  background: isActive ? "rgba(99, 102, 241, 0.08)" : "var(--glass-bg)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: isActive ? "var(--accent-gradient)" : "rgba(255, 255, 255, 0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isActive ? <UserCheck size={18} /> : <User size={18} />}
                  </div>
                  <div>
                    <h4 style={{ fontSize: "0.95rem" }}>{profile.name}</h4>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {profile.gender === "male" ? "Homme" : "Femme"} • {profile.heightCm}cm
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={(e) => handleDeleteProfile(profile.id, e)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal d'ajout de profil */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="glass-panel" style={{ width: "90%", maxWidth: "450px", padding: "32px", position: "relative" }}>
            <button
              onClick={() => setShowAddModal(false)}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ marginBottom: "24px", fontSize: "1.25rem" }}>Nouveau profil physique</h3>

            {error && (
              <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "16px" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleAddProfile}>
              <div className="input-group">
                <label className="input-label" htmlFor="name-input">Prénom ou Nom</label>
                <input
                  id="name-input"
                  className="input-field"
                  type="text"
                  placeholder="Ex: Adrien"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Genre</label>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className="btn"
                    style={{
                      flex: 1,
                      background: gender === "male" ? "var(--accent)" : "rgba(255, 255, 255, 0.03)",
                      border: `1px solid ${gender === "male" ? "var(--accent)" : "var(--glass-border)"}`,
                    }}
                  >
                    Homme
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className="btn"
                    style={{
                      flex: 1,
                      background: gender === "female" ? "var(--accent)" : "rgba(255, 255, 255, 0.03)",
                      border: `1px solid ${gender === "female" ? "var(--accent)" : "var(--glass-border)"}`,
                    }}
                  >
                    Femme
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="birthdate-input">Date de naissance</label>
                <div style={{ position: "relative" }}>
                  <Calendar
                    size={16}
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                  />
                  <input
                    id="birthdate-input"
                    className="input-field"
                    style={{ paddingLeft: "40px" }}
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: "28px" }}>
                <label className="input-label" htmlFor="height-input">Taille (cm)</label>
                <div style={{ position: "relative" }}>
                  <Ruler
                    size={16}
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                  />
                  <input
                    id="height-input"
                    className="input-field"
                    style={{ paddingLeft: "40px" }}
                    type="number"
                    min="50"
                    max="250"
                    value={heightCm}
                    onChange={(e) => setHeightCm(parseInt(e.target.value, 10))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={loading}
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default ProfileList;
