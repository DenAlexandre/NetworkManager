import { useEffect, useMemo, useState } from "react";
import { deleteEquipment, listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { EquipmentFormModal } from "./EquipmentFormModal";

const NO_API_LABEL = "Sans API";

function roomLabel(item: Equipment) {
  return `${item.siteName} / ${item.zoneName} / ${item.roomName}`;
}

export function EquipmentListPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceTypeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.deviceType);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const roomOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const item of items) labels.add(roomLabel(item));
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const apiOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.apiName ?? NO_API_LABEL);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const columns = useMemo<FilterColumn<Equipment>[]>(
    () => [
      { key: "name", getValue: (item) => item.name },
      {
        key: "deviceType",
        getValue: (item) => item.deviceType,
        type: "select",
        options: deviceTypeOptions.map((name) => ({ value: name, label: name })),
      },
      { key: "materiel", getValue: (item) => `${item.brandName} — ${item.hardwareModel}` },
      {
        key: "emplacement",
        getValue: roomLabel,
        type: "select",
        options: roomOptions.map((label) => ({ value: label, label })),
      },
      {
        key: "api",
        getValue: (item) => item.apiName ?? NO_API_LABEL,
        type: "select",
        options: apiOptions.map((name) => ({ value: name, label: name })),
      },
    ],
    [deviceTypeOptions, roomOptions, apiOptions]
  );

  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, columns);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

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
          <tr className="filter-row">
            {columns.map((column) => (
              <th key={column.key}>
                <ColumnFilterCell column={column} value={filters[column.key] ?? ""} onChange={(v) => setFilter(column.key, v)} />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.deviceType}</td>
              <td>
                {item.brandName} — {item.hardwareModel}
              </td>
              <td>
                {item.zoneName} / {item.roomName}
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
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <EquipmentFormModal equipmentId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
