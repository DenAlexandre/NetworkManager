import { useEffect, useState } from "react";
import { deleteEquipmentLink, listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { EquipmentLinkFormModal } from "./EquipmentLinkFormModal";

// Un seul filtre texte, qui cherche à la fois côté parent et côté enfant — les ports n'ont pas
// besoin d'être filtrables séparément.
const COLUMNS: FilterColumn<EquipmentLink>[] = [
  { key: "equipment", getValue: (item) => `${item.parentEquipmentName} ${item.childEquipmentName}` },
];

export function EquipmentLinksPage() {
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(links, COLUMNS);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { links: allLinks } = await listEquipmentLinks();
      setLinks(allLinks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLink(id: number) {
    if (!window.confirm("Supprimer cette liaison ?")) return;
    try {
      await deleteEquipmentLink(id);
      await load();
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
        <h2>Liaisons</h2>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      <p className="muted">Le matériel peut être relié à du matériel d'autres salles.</p>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Parent" field="parentEquipmentName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Port parent" field="parentPortLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Enfant" field="childEquipmentName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Port enfant" field="childPortLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th></th>
          </tr>
          <tr className="filter-row">
            <th>
              <ColumnFilterCell column={COLUMNS[0]} value={filters[COLUMNS[0].key] ?? ""} onChange={(v) => setFilter(COLUMNS[0].key, v)} />
            </th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((link) => (
            <tr key={link.id}>
              <td>{link.parentEquipmentName}</td>
              <td>{link.parentPortLabel}</td>
              <td>{link.childEquipmentName}</td>
              <td>{link.childPortLabel}</td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => openEditModal(link.id)}>
                  Modifier
                </button>
                <button className="danger" onClick={() => handleDeleteLink(link.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucune liaison enregistrée.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <EquipmentLinkFormModal linkId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
