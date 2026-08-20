import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRole, getRole, updateRole } from "../../api/roles";
import type { RolePermissionInput } from "../../api/roles";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { SECTIONS } from "../../constants/permissions";

interface RoleFormModalProps {
  roleId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RoleFormModal({ roleId, onClose, onSaved }: RoleFormModalProps) {
  const isEdit = roleId !== null;

  const [name, setName] = useState("");
  // Permissions aren't editable here (see the "Droits" tab) — kept as-is and resent unchanged so
  // renaming a role doesn't wipe them, since PUT /roles/:id replaces the full permission set.
  const [permissions, setPermissions] = useState<RolePermissionInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getRole(roleId)
      .then(({ role }) => {
        setName(role.name);
        setPermissions(
          SECTIONS.filter((s) => role.permissions[s]).map((section) => ({
            section,
            accessLevel: role.permissions[section]!,
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [roleId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, permissions };
      if (isEdit) {
        await updateRole(roleId, input);
      } else {
        await createRole(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le rôle" : "Ajouter un rôle"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {!isEdit && (
            <p className="muted">Les droits de ce rôle se configurent ensuite dans l'onglet "Droits".</p>
          )}
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
