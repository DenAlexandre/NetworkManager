import { useEffect, useState } from "react";
import { deleteEquipmentLink, listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { ApiError } from "../../api/client";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination";
import { EquipmentLinkFormModal } from "./EquipmentLinkFormModal";

export function EquipmentLinksPage() {
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { page, setPage, pageCount, pagedItems } = usePagination(links);

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
            <th>Parent</th>
            <th>Port parent</th>
            <th>Enfant</th>
            <th>Port enfant</th>
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
      {links.length === 0 && <p className="muted">Aucune liaison enregistrée.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <EquipmentLinkFormModal linkId={editingId} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
