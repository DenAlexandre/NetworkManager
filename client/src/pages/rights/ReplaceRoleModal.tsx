import { useState } from "react";
import type { FormEvent } from "react";
import { replaceRole } from "../../api/roles";
import type { Role } from "../../api/roles";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface ReplaceRoleModalProps {
  role: Role;
  otherRoles: Role[];
  onClose: () => void;
  onReplaced: () => void;
}

export function ReplaceRoleModal({ role, otherRoles, onClose, onReplaced }: ReplaceRoleModalProps) {
  const [replacementId, setReplacementId] = useState<number | "">(otherRoles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!replacementId) return;
    setError(null);
    setSubmitting(true);
    try {
      await replaceRole(role.id, Number(replacementId));
      onReplaced();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du remplacement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Remplacer "${role.name}"`} onClose={onClose}>
      <p className="muted">
        Ce rôle est utilisé par des utilisateurs existants et ne peut pas être supprimé directement.
        Choisissez un rôle de remplacement : tous les utilisateurs de "{role.name}" seront basculés
        vers ce rôle, qui sera ensuite supprimé.
      </p>
      {otherRoles.length === 0 ? (
        <p className="error">Aucun autre rôle disponible pour le remplacement.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Remplacer par
            <select value={replacementId} onChange={(e) => setReplacementId(Number(e.target.value))}>
              {otherRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Remplacement..." : "Remplacer et supprimer"}
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
