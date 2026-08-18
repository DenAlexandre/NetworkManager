import { useEffect, useMemo, useState } from "react";
import {
  deleteHardwareModel,
  hardwareModelDatasheetUrl,
  hardwareModelImageUrl,
  listHardwareModels,
} from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { listPorts } from "../../api/ports";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { PdfIcon } from "../../components/PdfIcon";
import { HardwareModelFormModal } from "./HardwareModelFormModal";

function formatPortCounts(counts: Record<string, number> | undefined) {
  if (!counts) return "—";
  const entries = Object.entries(counts);
  if (entries.length === 0) return "—";
  return entries.map(([name, count]) => `${name} : ${count}`).join(" · ");
}

export function HardwareModelsListPage() {
  const [items, setItems] = useState<HardwareModel[]>([]);
  const [portCounts, setPortCounts] = useState<Record<number, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceTypeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.deviceType);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const columns = useMemo<FilterColumn<HardwareModel>[]>(
    () => [
      { key: "name", getValue: (item) => item.name },
      { key: "brandName", getValue: (item) => item.brandName },
      {
        key: "deviceType",
        getValue: (item) => item.deviceType,
        type: "select",
        options: deviceTypeOptions.map((name) => ({ value: name, label: name })),
      },
      { key: "ports", getValue: (item) => formatPortCounts(portCounts[item.id]) },
    ],
    [deviceTypeOptions, portCounts]
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
      const [{ hardwareModels }, { ports }] = await Promise.all([listHardwareModels(), listPorts()]);
      setItems(hardwareModels);
      const counts: Record<number, Record<string, number>> = {};
      for (const port of ports) {
        const byType = (counts[port.hardwareModelId] ??= {});
        byType[port.portType] = (byType[port.portType] || 0) + 1;
      }
      setPortCounts(counts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce matériel ?")) return;
    try {
      await deleteHardwareModel(id);
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
            <th></th>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader
              label="Constructeur"
              field="brandName"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Type"
              field="deviceType"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th>Ports</th>
            <th></th>
          </tr>
          <tr className="filter-row">
            <th></th>
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
              <td>
                {item.imagePath && (
                  <img
                    className="hardware-model-thumbnail"
                    src={hardwareModelImageUrl(item.imagePath)}
                    alt=""
                  />
                )}
              </td>
              <td>{item.name}</td>
              <td>{item.brandName}</td>
              <td>{item.deviceType}</td>
              <td>{formatPortCounts(portCounts[item.id])}</td>
              <td className="table-actions">
                {item.datasheetPath && (
                  <a
                    href={hardwareModelDatasheetUrl(item.datasheetPath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Voir le PDF constructeur"
                    aria-label="Voir le PDF constructeur"
                  >
                    <PdfIcon />
                  </a>
                )}
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
        <HardwareModelFormModal hardwareModelId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
