import { useEffect, useState } from "react";
import { deleteApi, listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { ApiFormModal } from "./ApiFormModal";
import { usePermission } from "../../hooks/usePermission";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

const YES_NO_OPTIONS = [
  { value: "Oui", label: "Oui" },
  { value: "Non", label: "Non" },
];

const COLUMNS: FilterColumn<Api>[] = [
  { key: "name", getValue: (item) => item.name },
  { key: "migrationDate", getValue: (item) => formatDate(item.migrationDate) },
  {
    key: "completed",
    getValue: (item) => (item.completed ? "Oui" : "Non"),
    type: "select",
    options: YES_NO_OPTIONS,
  },
  {
    key: "doeUpToDate",
    getValue: (item) => (item.doeUpToDate ? "Oui" : "Non"),
    type: "select",
    options: YES_NO_OPTIONS,
  },
];

export function ApisListPage() {
  const { canWrite } = usePermission("apis");
  const [items, setItems] = useState<Api[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, COLUMNS);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { apis } = await listApis();
      setItems(apis);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette API ?")) return;
    try {
      await deleteApi(id);
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
        <h1>Gestion des API</h1>
        {canWrite && (
          <button type="button" className="btn" onClick={openCreateModal}>
            Ajouter
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader
              label="Date de migration"
              field="migrationDate"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th>Terminé</th>
            <th>DOE à jour</th>
            <th></th>
          </tr>
          <tr className="filter-row">
            {COLUMNS.map((column) => (
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
              <td>{formatDate(item.migrationDate)}</td>
              <td>
                {item.completed ? (
                  <span className="status-check">✓</span>
                ) : (
                  <span className="status-cross">✕</span>
                )}
              </td>
              <td>
                {item.doeUpToDate ? (
                  <span className="status-check">✓</span>
                ) : (
                  <span className="status-cross">✕</span>
                )}
              </td>
              <td className="table-actions">
                {canWrite && (
                  <>
                    <button type="button" className="link" onClick={() => openEditModal(item.id)}>
                      Modifier
                    </button>
                    <button className="danger" onClick={() => handleDelete(item.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucune API enregistrée.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && <ApiFormModal apiId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />}
    </div>
  );
}
