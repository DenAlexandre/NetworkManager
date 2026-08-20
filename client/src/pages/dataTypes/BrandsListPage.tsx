import { useEffect, useState } from "react";
import { createBrand, deleteBrand, getBrand, listBrands, updateBrand } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { SimpleNameFormModal } from "../../components/SimpleNameFormModal";
import { usePermission } from "../../hooks/usePermission";

const COLUMNS: FilterColumn<Brand>[] = [{ key: "name", getValue: (item) => item.name }];

export function BrandsListPage() {
  const { canWrite } = usePermission("data-types");
  const [items, setItems] = useState<Brand[]>([]);
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
      const { brands } = await listBrands();
      setItems(brands);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce constructeur ?")) return;
    try {
      await deleteBrand(id);
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
        <h2>Constructeurs</h2>
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
              <td>{item.name}</td>
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
      {rows.length === 0 && <p className="muted">Aucun constructeur enregistré.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <SimpleNameFormModal
          title={editingId === null ? "Ajouter un constructeur" : "Modifier le constructeur"}
          itemId={editingId}
          loadName={async (id) => (await getBrand(id)).brand.name}
          save={async (name) => {
            if (editingId === null) {
              await createBrand({ name });
            } else {
              await updateBrand(editingId, { name });
            }
          }}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
