import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteEquipment, listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";
import { EquipmentFormModal } from "./EquipmentFormModal";

function searchFields(item: Equipment) {
  return [
    item.name,
    item.deviceType,
    item.brandName,
    item.hardwareModel,
    item.siteName,
    item.zoneName,
    item.roomName,
    item.apiName,
  ];
}

export function EquipmentListPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roomFilter, setRoomFilter] = useState<number | "">("");
  const [apiFilter, setApiFilter] = useState<number | "none" | "">("");

  const roomOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      map.set(item.roomId, `${item.siteName} / ${item.zoneName} / ${item.roomName}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const apiOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      if (item.apiId !== null && item.apiName) map.set(item.apiId, item.apiName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (roomFilter !== "" && item.roomId !== roomFilter) return false;
      if (apiFilter === "none" && item.apiId !== null) return false;
      if (typeof apiFilter === "number" && item.apiId !== apiFilter) return false;
      return true;
    });
  }, [items, roomFilter, apiFilter]);

  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(filteredItems, searchFields);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (!editParam) return;
    setEditingId(Number(editParam));
    setModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  async function load() {
    setLoading(true);
    try {
      const { equipment } = await listEquipment();
      setItems(equipment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce matériel ?")) return;
    try {
      await deleteEquipment(id);
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
        <h2>Matériel</h2>
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
        <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Toutes les salles</option>
          {roomOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={apiFilter}
          onChange={(e) => setApiFilter(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}
        >
          <option value="">Toutes les API</option>
          <option value="none">Sans API</option>
          {apiOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Type" field="deviceType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th>Matériel</th>
            <th>Emplacement</th>
            <th>API</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.deviceType}</td>
              <td>
                {item.brandName} — {item.hardwareModel}
              </td>
              <td>
                {item.siteName} / {item.zoneName} / {item.roomName}
              </td>
              <td>{item.apiName ?? "—"}</td>
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
      {rows.length === 0 && <p className="muted">Aucun matériel enregistré.</p>}
      {modalOpen && (
        <EquipmentFormModal equipmentId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
