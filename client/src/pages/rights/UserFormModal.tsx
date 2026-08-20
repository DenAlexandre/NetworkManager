import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createUser, getUser, updateUser } from "../../api/users";
import { listRoles } from "../../api/roles";
import type { Role } from "../../api/roles";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { PasswordField } from "../../components/PasswordField";
import { useAuth } from "../../context/AuthContext";

interface UserFormModalProps {
  userId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormModal({ userId, onClose, onSaved }: UserFormModalProps) {
  const isEdit = userId !== null;
  const { user: currentUser, refreshUser } = useAuth();
  const isSelf = isEdit && currentUser?.id === userId;

  const [roles, setRoles] = useState<Role[]>([]);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listRoles(), isEdit ? getUser(userId) : null])
      .then(([{ roles }, userResult]) => {
        setRoles(roles);
        if (userResult) {
          const { user } = userResult;
          setUsername(user.username);
          setFirstName(user.firstName);
          setLastName(user.lastName);
          setEmail(user.email);
          setPhone(user.phone);
          setRoleId(user.roleId);
        } else {
          setRoleId(roles[0]?.id ?? "");
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [userId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roleId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateUser(userId, {
          username,
          firstName,
          lastName,
          email,
          phone,
          roleId,
          ...(password ? { password } : {}),
        });
        if (isSelf) {
          await refreshUser();
        }
      } else {
        await createUser({ username, firstName, lastName, email, phone, password, roleId });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier l'utilisateur" : "Ajouter un utilisateur"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Pseudo
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Nom
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Prénom
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Téléphone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label>
            {isEdit ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe (8 caractères minimum)"}
            <PasswordField
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required={!isEdit}
            />
          </label>
          <label>
            Rôle
            <select
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
              disabled={isSelf}
              title={isSelf ? "Vous ne pouvez pas modifier votre propre rôle." : undefined}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          {isSelf && <p className="muted">Vous ne pouvez pas modifier votre propre rôle.</p>}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Enregistrer
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
