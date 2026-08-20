import { useEffect, useState } from "react";
import { deleteRole, listRoles } from "../../api/roles";
import type { Role } from "../../api/roles";
import { ApiError } from "../../api/client";
import { RoleFormModal } from "./RoleFormModal";
import { ReplaceRoleModal } from "./ReplaceRoleModal";

export function RolesListPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { roles } = await listRoles();
      setRoles(roles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce rôle ?")) return;
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReplacingId(id);
        return;
      }
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function handleReplaced() {
    setReplacingId(null);
    load();
  }

  function openCreateModal() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openEditModal(id: number) {
    setEditingId(id);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    load();
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Rôles</h2>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Utilisateurs</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>{role.name}</td>
              <td>{role.userCount}</td>
              <td className="table-actions">
                {role.isAdmin ? (
                  <span className="muted">Rôle système</span>
                ) : (
                  <>
                    <button type="button" className="link" onClick={() => openEditModal(role.id)}>
                      Modifier
                    </button>
                    <button className="danger" onClick={() => handleDelete(role.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {roles.length === 0 && <p className="muted">Aucun rôle enregistré.</p>}
      {modalOpen && (
        <RoleFormModal roleId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
      {replacingId !== null && (
        <ReplaceRoleModal
          role={roles.find((r) => r.id === replacingId)!}
          otherRoles={roles.filter((r) => r.id !== replacingId)}
          onClose={() => setReplacingId(null)}
          onReplaced={handleReplaced}
        />
      )}
    </div>
  );
}
