import { useEffect, useState } from "react";
import { createDeviceType, deleteDeviceType, getDeviceType, listDeviceTypes, updateDeviceType } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";
import { SimpleNameFormModal } from "../../components/SimpleNameFormModal";

function searchFields(item: DeviceType) {
  return [item.name];
}

export function DeviceTypesListPage() {
  const [items, setItems] = useState<DeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { deviceTypes } = await listDeviceTypes();
      setItems(deviceTypes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce type de matériel ?")) return;
    try {
      await deleteDeviceType(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
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
        <h2>Types de matériel</h2>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="Filtrer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => openEditModal(item.id)}>
                  Modifier
                </button>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucun type de matériel enregistré.</p>}
      {modalOpen && (
        <SimpleNameFormModal
          title={editingId === null ? "Ajouter un type de matériel" : "Modifier le type de matériel"}
          itemId={editingId}
          loadName={async (id) => (await getDeviceType(id)).deviceType.name}
          save={async (name) => {
            if (editingId === null) {
              await createDeviceType({ name });
            } else {
              await updateDeviceType(editingId, { name });
            }
          }}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
