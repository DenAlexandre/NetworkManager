import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSite, listSites, siteDatasheetUrl } from "../../api/sites";
import type { Site } from "../../api/sites";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { PdfIcon } from "../../components/PdfIcon";
import { useSitesTree } from "../../context/SitesTreeContext";
import { SiteFormModal } from "./SiteFormModal";

const COLUMNS: FilterColumn<Site>[] = [{ key: "name", getValue: (item) => item.name }];

export function SitesListPage() {
  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, COLUMNS);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);
  const { refresh } = useSitesTree();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { sites } = await listSites();
      setItems(sites);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce site ?")) return;
    try {
      await deleteSite(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      refresh();
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
        <h1>Gestion des Sites</h1>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th></th>
          </tr>
          <tr className="filter-row">
            <th>
              <ColumnFilterCell column={COLUMNS[0]} value={filters[COLUMNS[0].key] ?? ""} onChange={(v) => setFilter(COLUMNS[0].key, v)} />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/sites/${item.id}`}>{item.name}</Link>
              </td>
              <td className="table-actions">
                {item.datasheetPath && (
                  <a
                    href={siteDatasheetUrl(item.datasheetPath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Voir le PDF du site"
                    aria-label="Voir le PDF du site"
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
      {rows.length === 0 && <p className="muted">Aucun site enregistré.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <SiteFormModal siteId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
