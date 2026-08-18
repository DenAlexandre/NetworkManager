import { useEffect, useState } from "react";
import { deleteLinkType, listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { LinkTypeFormModal } from "./LinkTypeFormModal";

const COLUMNS: FilterColumn<LinkType>[] = [
  { key: "name", getValue: (item) => item.name },
  {
    key: "pointToPoint",
    getValue: (item) => (item.pointToPoint ? "Oui" : "Non"),
    type: "select",
    options: [
      { value: "Oui", label: "Oui" },
      { value: "Non", label: "Non" },
    ],
  },
];

export function LinkTypesListPage() {
  const [items, setItems] = useState<LinkType[]>([]);
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
      const { linkTypes } = await listLinkTypes();
      setItems(linkTypes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce type de liaison ?")) return;
    try {
      await deleteLinkType(id);
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
        <h2>Types de liaison</h2>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th>Trait</th>
            <th>Point à point</th>
            <th></th>
          </tr>
          <tr className="filter-row">
            <th>
              <ColumnFilterCell column={COLUMNS[0]} value={filters[COLUMNS[0].key] ?? ""} onChange={(v) => setFilter(COLUMNS[0].key, v)} />
            </th>
            <th></th>
            <th>
              <ColumnFilterCell column={COLUMNS[1]} value={filters[COLUMNS[1].key] ?? ""} onChange={(v) => setFilter(COLUMNS[1].key, v)} />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                <svg width="60" height="16" aria-label={`${item.color}, ${item.strokeWidth}px`}>
                  <line
                    x1="4"
                    y1="8"
                    x2="56"
                    y2="8"
                    stroke={item.color}
                    strokeWidth={item.strokeWidth}
                    strokeLinecap="round"
                  />
                </svg>
              </td>
              <td>{item.pointToPoint ? "Oui" : "Non"}</td>
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
      {rows.length === 0 && <p className="muted">Aucun type de liaison enregistré.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && <LinkTypeFormModal linkTypeId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />}
    </div>
  );
}
