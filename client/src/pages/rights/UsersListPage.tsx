import { useEffect, useState } from "react";
import { deleteUser, listUsers } from "../../api/users";
import type { ManagedUser } from "../../api/users";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { UserFormModal } from "./UserFormModal";

export function UsersListPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { users } = await listUsers();
      setUsers(users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
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
        <h2>Utilisateurs</h2>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Pseudo</th>
            <th>Nom</th>
            <th>Email</th>
            <th>Rôle</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>
                {user.firstName} {user.lastName}
              </td>
              <td>{user.email}</td>
              <td>{user.roleName}</td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => openEditModal(user.id)}>
                  Modifier
                </button>
                {user.id !== currentUser?.id && (
                  <button className="danger" onClick={() => handleDelete(user.id)}>
                    Supprimer
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="muted">Aucun utilisateur enregistré.</p>}
      {modalOpen && (
        <UserFormModal userId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
