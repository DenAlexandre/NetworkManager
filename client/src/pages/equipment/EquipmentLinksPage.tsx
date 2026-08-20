import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { usePermission } from "../../hooks/usePermission";

// Un seul filtre texte, qui cherche à la fois côté parent et côté enfant — les ports n'ont pas
// besoin d'être filtrables séparément.
const COLUMNS: FilterColumn<EquipmentLink>[] = [
  { key: "equipment", getValue: (item) => `${item.parentEquipmentName} ${item.childEquipmentName}` },
];

export function EquipmentLinksPage() {
  const { canWrite } = usePermission("equipment");
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(links, COLUMNS);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  useEffect(() => {
    load();
  }, []);

  // Supports deep-linking here (e.g. from Design's link context menu) via
  // /equipment/links?open=<linkId>&returnTo=<path>, opening that link's edit modal directly once
  // the list has loaded, then stripping the query params so they don't reopen on refresh. returnTo
  // is remembered so closing/saving the modal sends the user back where they came from instead of
  // leaving them stranded on this list.
  useEffect(() => {
    const openId = Number(searchParams.get("open"));
    if (!openId || !links.some((link) => link.id === openId)) return;
    setReturnTo(searchParams.get("returnTo"));
    openEditModal(openId);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, searchParams, setSearchParams]);

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

  function closeModal() {
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    setModalOpen(false);
  }

  function handleSaved() {
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    setModalOpen(false);
    load();
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Liaisons</h2>
        {canWrite && (
          <button type="button" className="btn" onClick={openCreateModal}>
            Ajouter
          </button>
        )}
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
            <SortableHeader label="Type de configuration" field="configurationTypeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              <td>{link.configurationTypeName ?? "—"}</td>
              <td className="table-actions">
                {canWrite && (
                  <>
                    <button type="button" className="link" onClick={() => openEditModal(link.id)}>
                      Modifier
                    </button>
                    <button className="danger" onClick={() => handleDeleteLink(link.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucune liaison enregistrée.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <EquipmentLinkFormModal linkId={editingId} onClose={closeModal} onSaved={handleSaved} />
      )}
    </div>
  );
}
